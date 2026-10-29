// Provider-agnostic structured extraction.
//
// One entry point, `extractWithAI`, takes a system prompt, the document content and a JSON Schema,
// calls the configured provider, has it answer through a single tool/function call, and
// returns the parsed arguments. Three providers sit behind it:
//
//   anthropic  Messages API         PDFs as native `document` blocks, tool call requested via
//                                   tool_choice "auto" (see callAnthropic for why not forced)
//   openai     Responses API        PDFs as `input_file` parts, forced function call
//   google     Generative Language  PDFs as `inlineData`, forced function call (mode ANY)
//
// Configuration comes from environment variables (see .env.example):
//   AI_PROVIDER                              "anthropic" | "openai" | "google"
//   ANTHROPIC_API_KEY / OPENAI_API_KEY / GOOGLE_API_KEY
//   ANTHROPIC_MODEL / OPENAI_MODEL / GOOGLE_MODEL   optional model id overrides
//
// Server-side only: it reads API keys from process.env. Call it from server functions.

export type AIProviderName = "anthropic" | "openai" | "google";

export type AIContentPart =
  | { type: "text"; text: string }
  | { type: "file"; mimeType: string; base64: string; filename?: string };

/** A plain string for text-only inputs (CSV/XLSX), or parts for PDFs and images. */
export type AIContent = string | AIContentPart[];

export interface AIExtractionRequest {
  system: string;
  content: AIContent;
  /** JSON Schema (root must be an object) describing the extraction result. */
  schema: Record<string, unknown>;
  /** Name of the tool the model must call. The system prompt refers to it by name. */
  toolName?: string;
  toolDescription?: string;
}

export interface AIConfig {
  provider: AIProviderName;
  apiKey: string;
  model: string;
}

export type AIErrorKind = "config" | "rate_limit" | "credits" | "provider" | "bad_response";

export class AIProviderError extends Error {
  readonly kind: AIErrorKind;
  readonly status?: number;
  constructor(kind: AIErrorKind, message: string, status?: number) {
    super(message);
    this.name = "AIProviderError";
    this.kind = kind;
    this.status = status;
  }
}

const PROVIDERS: AIProviderName[] = ["anthropic", "openai", "google"];

const KEY_VARS: Record<AIProviderName, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_API_KEY",
};

const MODEL_VARS: Record<AIProviderName, string> = {
  anthropic: "ANTHROPIC_MODEL",
  openai: "OPENAI_MODEL",
  google: "GOOGLE_MODEL",
};

const KEY_URLS: Record<AIProviderName, string> = {
  anthropic: "https://console.anthropic.com/settings/keys",
  openai: "https://platform.openai.com/api-keys",
  google: "https://aistudio.google.com/apikey",
};

// Default model per provider. These move: providers retire and replace models every few months,
// so they may need updating (or override them with ANTHROPIC_MODEL / OPENAI_MODEL / GOOGLE_MODEL).
// Last checked against each provider's model docs on 2026-10-28.
const DEFAULT_MODELS: Record<AIProviderName, string> = {
  anthropic: "claude-sonnet-5-5",
  openai: "gpt-6.1-sol",
  google: "gemini-3.8-flash",
};

const DEFAULT_TOOL_NAME = "record_statement";
const DEFAULT_TOOL_DESCRIPTION = "Record extracted merchant statement data.";

// Upper bound on the tokens one Anthropic extraction call may return (thinking tokens count toward
// it). A call that hits it is reported as truncated rather than silently returning partial data.
const MAX_OUTPUT_TOKENS = 32000;

function setupHelp(): string {
  return [
    `Set AI_PROVIDER to one of: ${PROVIDERS.join(", ")}, and set the matching API key:`,
    ...PROVIDERS.map((p) => `  - AI_PROVIDER=${p}  ->  ${KEY_VARS[p]}  (get a key at ${KEY_URLS[p]})`),
    `Optionally override the model with ${PROVIDERS.map((p) => MODEL_VARS[p]).join(", ")}.`,
    "Put these in .env locally, or in your host's environment variables when deployed.",
  ].join("\n");
}

/** Reads and validates the AI provider settings. Throws an AIProviderError("config") with setup help. */
export function resolveAIConfig(env: Record<string, string | undefined> = process.env): AIConfig {
  const raw = env.AI_PROVIDER?.trim().toLowerCase();
  if (!raw) {
    throw new AIProviderError("config", `No AI provider is configured.\n${setupHelp()}`);
  }
  if (!(PROVIDERS as string[]).includes(raw)) {
    throw new AIProviderError("config", `AI_PROVIDER="${env.AI_PROVIDER}" is not supported.\n${setupHelp()}`);
  }
  const provider = raw as AIProviderName;
  const apiKey = env[KEY_VARS[provider]]?.trim();
  if (!apiKey) {
    throw new AIProviderError(
      "config",
      `AI_PROVIDER is "${provider}" but ${KEY_VARS[provider]} is not set. Get a key at ${KEY_URLS[provider]} and set ${KEY_VARS[provider]}.`,
    );
  }
  const model = env[MODEL_VARS[provider]]?.trim() || DEFAULT_MODELS[provider];
  return { provider, apiKey, model };
}

/** Sends the content to the configured provider and returns the parsed tool-call arguments. */
export async function extractWithAI(req: AIExtractionRequest, config: AIConfig = resolveAIConfig()): Promise<any> {
  const normalised = {
    ...req,
    toolName: req.toolName ?? DEFAULT_TOOL_NAME,
    toolDescription: req.toolDescription ?? DEFAULT_TOOL_DESCRIPTION,
  };
  switch (config.provider) {
    case "anthropic":
      return callAnthropic(normalised, config);
    case "openai":
      return callOpenAI(normalised, config);
    case "google":
      return callGoogle(normalised, config);
  }
}

type NormalisedRequest = AIExtractionRequest & { toolName: string; toolDescription: string };

function toParts(content: AIContent): AIContentPart[] {
  return typeof content === "string" ? [{ type: "text", text: content }] : content;
}

function describe(config: AIConfig): string {
  return `${config.provider} (${config.model})`;
}

// ── Shared HTTP + error handling ──────────────────────────────────────────────

async function postJson(url: string, headers: Record<string, string>, body: unknown, config: AIConfig): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await toProviderError(res, config);
  return res.json();
}

async function toProviderError(res: Response, config: AIConfig): Promise<AIProviderError> {
  const text = await res.text();
  let detail = text.slice(0, 500);
  let code = "";
  try {
    const json = JSON.parse(text);
    const err = json?.error ?? json;
    detail = typeof err === "string" ? err : (err?.message ?? detail);
    code = String(err?.code ?? err?.type ?? err?.status ?? "");
  } catch {
    // Non-JSON error body: keep the raw text.
  }
  const haystack = `${code} ${detail}`.toLowerCase();
  const who = describe(config);

  if (res.status === 401 || res.status === 403 || /api key not valid|invalid x-api-key|incorrect api key|invalid api key/.test(haystack)) {
    return new AIProviderError("config", `${who} rejected the API key. Check ${KEY_VARS[config.provider]} (${KEY_URLS[config.provider]}). Provider said: ${detail}`, res.status);
  }
  if (res.status === 402 || /insufficient_quota|credit balance|billing/.test(haystack)) {
    return new AIProviderError("credits", `${who} reports no credit or quota left. Check your plan and billing with the provider. Provider said: ${detail}`, res.status);
  }
  if (res.status === 429 || res.status === 529 || /resource_exhausted|overloaded|rate.?limit/.test(haystack)) {
    return new AIProviderError("rate_limit", `AI rate limit or quota reached (${who}). Wait a minute and try again, or check your plan limits.`, res.status);
  }
  return new AIProviderError("provider", `AI provider error from ${who} (${res.status}): ${detail}`, res.status);
}

function badResponse(config: AIConfig, why: string): AIProviderError {
  return new AIProviderError("bad_response", `${describe(config)} did not return a usable extraction: ${why}`);
}

// ── Anthropic ─────────────────────────────────────────────────────────────────

// Anthropic's strict tool use (`strict: true`) guarantees the tool input matches the schema, but
// only accepts a JSON Schema subset with explicit complexity limits. These are the documented caps.
const STRICT_MAX_OPTIONAL_PARAMS = 24; // properties not listed in `required`, across the schema
const STRICT_MAX_UNION_PARAMS = 16; // properties using anyOf or a type array such as ["string", "null"]

/**
 * Derives a strict-compatible schema: `additionalProperties: false` on every object, and nullable
 * fields (`["string", "null"]`, enums containing null) become plain non-null types. Those fields are
 * not in `required`, so under strict mode the model omits a value it cannot read instead of
 * returning null. (Keeping them as type arrays would exceed the union-type limit.)
 */
export function toAnthropicStrictSchema(node: any): any {
  if (Array.isArray(node)) return node.map(toAnthropicStrictSchema);
  if (node === null || typeof node !== "object") return node;

  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "properties" && value && typeof value === "object") {
      out.properties = Object.fromEntries(Object.entries(value).map(([name, schema]) => [name, toAnthropicStrictSchema(schema)]));
    } else if (key === "items") {
      out.items = toAnthropicStrictSchema(value);
    } else {
      out[key] = value;
    }
  }
  if (Array.isArray(out.type)) {
    const nonNull = out.type.filter((t: string) => t !== "null");
    out.type = nonNull.length === 1 ? nonNull[0] : nonNull;
  }
  if (Array.isArray(out.enum)) out.enum = out.enum.filter((v: unknown) => v !== null);
  if (out.type === "object" || out.properties) out.additionalProperties = false;
  return out;
}

/** Counts what Anthropic limits in strict schemas: optional properties and union-typed properties. */
export function strictSchemaComplexity(node: any): { optional: number; unions: number } {
  const total = { optional: 0, unions: 0 };
  const walk = (n: any) => {
    if (!n || typeof n !== "object") return;
    if (n.properties && typeof n.properties === "object") {
      const required = new Set<string>(Array.isArray(n.required) ? n.required : []);
      for (const [name, schema] of Object.entries<any>(n.properties)) {
        if (!required.has(name)) total.optional++;
        if (Array.isArray(schema?.type) || schema?.anyOf) total.unions++;
        walk(schema);
      }
    }
    if (n.items) walk(n.items);
  };
  walk(node);
  return total;
}

async function callAnthropic(req: NormalisedRequest, config: AIConfig): Promise<any> {
  const parts = toParts(req.content);
  // Anthropic recommends placing documents and images before the text that refers to them.
  const files = parts.filter((p) => p.type === "file");
  const texts = parts.filter((p) => p.type === "text");
  const content = [...files, ...texts].map((p) => {
    if (p.type === "text") return { type: "text", text: p.text };
    const block = p.mimeType === "application/pdf" ? "document" : p.mimeType.startsWith("image/") ? "image" : null;
    if (!block) throw new AIProviderError("provider", `Anthropic cannot read files of type ${p.mimeType}.`);
    return { type: block, source: { type: "base64", media_type: p.mimeType, data: p.base64 } };
  });

  // The tool call is requested with tool_choice "auto" plus an explicit instruction, not forced
  // with {type: "tool"}: Anthropic's current models (Claude Sonnet 5.5, Opus 5.5, Fable 5.1)
  // reject forced tool use with a 400, while "auto" is accepted by every model. Marking the tool
  // `strict: true` is Anthropic's recommended way to still guarantee a schema-valid input.
  const strictSchema = toAnthropicStrictSchema(req.schema);
  const complexity = strictSchemaComplexity(strictSchema);
  // Only ask for strict mode when the schema fits the documented limits; otherwise a 400 would
  // fail every extraction. A schema that grows past them silently falls back to non-strict.
  let useStrict = complexity.optional <= STRICT_MAX_OPTIONAL_PARAMS && complexity.unions <= STRICT_MAX_UNION_PARAMS;
  const instruction = `Return the complete extraction by calling the ${req.toolName} tool exactly once. Do not answer in plain text.`;
  const strictNote = " Omit any field you cannot read instead of using null.";
  const buildBody = (strict: boolean) => ({
    model: config.model,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: `${req.system}\n\n${instruction}${strict ? strictNote : ""}`,
    messages: [{ role: "user", content }],
    tools: [
      {
        name: req.toolName,
        description: req.toolDescription,
        input_schema: strict ? strictSchema : req.schema,
        ...(strict ? { strict: true } : {}),
      },
    ],
    tool_choice: { type: "auto" },
  });

  // "auto" lets the model answer in text instead, which is rare; try once more before giving up.
  for (let attempt = 1; ; attempt++) {
    let json: any;
    try {
      json = await postJson(
        "https://api.anthropic.com/v1/messages",
        { "x-api-key": config.apiKey, "anthropic-version": "2023-06-01" },
        buildBody(useStrict),
        config,
      );
    } catch (err) {
      // The strict-schema limits could not be checked against a live API, so if Anthropic rejects
      // the schema itself, retry once without strict mode rather than failing the extraction.
      if (useStrict && err instanceof AIProviderError && err.status === 400 && /schema|strict|grammar|compil|complex/i.test(err.message)) {
        console.warn(`[ai-provider] Anthropic rejected the strict schema; retrying without strict mode. ${err.message}`);
        useStrict = false;
        attempt--;
        continue;
      }
      throw err;
    }
    if (json?.stop_reason === "max_tokens") throw badResponse(config, "the response was cut off at the output limit.");
    const call = (json?.content ?? []).find((b: any) => b?.type === "tool_use" && b?.name === req.toolName);
    if (call?.input && typeof call.input === "object") return call.input;
    if (attempt >= 2) throw badResponse(config, "no tool call in the response.");
  }
}

// ── OpenAI (Responses API) ────────────────────────────────────────────────────
// The Responses API, not Chat Completions: OpenAI's current models (GPT-6 Astra, GPT-6.1 Sol)
// require it for tool calling.

async function callOpenAI(req: NormalisedRequest, config: AIConfig): Promise<any> {
  const content = toParts(req.content).map((p) => {
    if (p.type === "text") return { type: "input_text", text: p.text };
    const dataUrl = `data:${p.mimeType};base64,${p.base64}`;
    if (p.mimeType === "application/pdf") {
      return { type: "input_file", filename: p.filename ?? "statement.pdf", file_data: dataUrl };
    }
    if (p.mimeType.startsWith("image/")) return { type: "input_image", image_url: dataUrl };
    throw new AIProviderError("provider", `OpenAI cannot read files of type ${p.mimeType}.`);
  });

  const json = await postJson(
    "https://api.openai.com/v1/responses",
    { authorization: `Bearer ${config.apiKey}` },
    {
      model: config.model,
      instructions: req.system,
      input: [{ role: "user", content }],
      // strict:false because the extraction schema uses nullable types; strict mode (the default on
      // this API) would require every property to be required and additionalProperties:false.
      tools: [{ type: "function", name: req.toolName, description: req.toolDescription, parameters: req.schema, strict: false }],
      tool_choice: { type: "function", name: req.toolName },
      // Don't keep customer statements in OpenAI's stored responses.
      store: false,
    },
    config,
  );

  if (json?.status === "incomplete") {
    throw badResponse(config, `the response was cut off (${json?.incomplete_details?.reason ?? "incomplete"}).`);
  }
  const call = (json?.output ?? []).find((item: any) => item?.type === "function_call" && item?.name === req.toolName);
  if (typeof call?.arguments !== "string") throw badResponse(config, "no tool call in the response.");
  try {
    return JSON.parse(call.arguments);
  } catch {
    throw badResponse(config, "the tool call arguments were not valid JSON.");
  }
}

// ── Google (Gemini) ───────────────────────────────────────────────────────────

const GEMINI_TYPES: Record<string, string> = {
  object: "OBJECT",
  array: "ARRAY",
  string: "STRING",
  number: "NUMBER",
  integer: "INTEGER",
  boolean: "BOOLEAN",
};

/**
 * Gemini's function-declaration schema is an OpenAPI subset: one upper-case `type`, `nullable`
 * instead of `["string", "null"]`, and no `null` inside enums. Converts the JSON Schema used by the
 * other providers.
 */
export function toGeminiSchema(node: any): any {
  if (node === null || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(toGeminiSchema);

  const out: Record<string, any> = {};
  const types: string[] = Array.isArray(node.type) ? node.type : node.type ? [node.type] : [];
  const nonNull = types.filter((t) => t !== "null");
  if (nonNull.length) out.type = GEMINI_TYPES[nonNull[0]] ?? String(nonNull[0]).toUpperCase();
  if (types.includes("null")) out.nullable = true;
  if (typeof node.description === "string") out.description = node.description;
  if (typeof node.format === "string") out.format = node.format;
  if (Array.isArray(node.enum)) {
    const values = node.enum.filter((v: unknown) => v !== null);
    if (values.length < node.enum.length) out.nullable = true;
    out.enum = values;
  }
  if (node.properties && typeof node.properties === "object") {
    out.properties = Object.fromEntries(Object.entries(node.properties).map(([k, v]) => [k, toGeminiSchema(v)]));
  }
  if (node.items) out.items = toGeminiSchema(node.items);
  if (Array.isArray(node.required) && node.required.length) out.required = node.required;
  return out;
}

async function callGoogle(req: NormalisedRequest, config: AIConfig): Promise<any> {
  const parts = toParts(req.content).map((p) =>
    p.type === "text" ? { text: p.text } : { inlineData: { mimeType: p.mimeType, data: p.base64 } },
  );

  const json = await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`,
    { "x-goog-api-key": config.apiKey },
    {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: "user", parts }],
      tools: [{ functionDeclarations: [{ name: req.toolName, description: req.toolDescription, parameters: toGeminiSchema(req.schema) }] }],
      toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: [req.toolName] } },
      // Don't log this request to the project's Logs and datasets. Google stores generateContent
      // requests by default for projects created on or after 2026-10-26, and this overrides it.
      // It does not change Google's own abuse-monitoring or unpaid-tier data-use terms.
      store: false,
    },
    config,
  );

  const candidate = json?.candidates?.[0];
  if (candidate?.finishReason === "MAX_TOKENS") throw badResponse(config, "the response was cut off at the output limit.");
  const call = (candidate?.content?.parts ?? []).find((p: any) => p?.functionCall?.name === req.toolName)?.functionCall;
  if (!call?.args || typeof call.args !== "object") {
    const reason = json?.promptFeedback?.blockReason ?? candidate?.finishReason ?? "no function call in the response";
    throw badResponse(config, String(reason));
  }
  return call.args;
}
