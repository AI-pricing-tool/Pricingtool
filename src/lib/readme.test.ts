import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Keeps the setup instructions honest: the README is what a newcomer follows, so every file, variable,
// command and screen it names must exist, and nothing .env.example asks people to find may be unused.
const root = fileURLToPath(new URL("../../", import.meta.url));
const SKIP = new Set(["node_modules", ".output", ".vercel", ".wrangler", ".tanstack", ".nitro", ".vinxi", "dist", ".git"]);

const allFiles: string[] = [];
const allDirs: string[] = [];
(function walk(dir: string) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = dir + name;
    if (statSync(full).isDirectory()) { allDirs.push(full.slice(root.length)); walk(full + "/"); } else allFiles.push(full.slice(root.length));
  }
})(root);

const readme = readFileSync(root + "README.md", "utf8");
const envExample = readFileSync(root + ".env.example", "utf8");
const pkg = JSON.parse(readFileSync(root + "package.json", "utf8")) as { scripts: Record<string, string> };
const tokens = [...readme.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);

const sourceText = allFiles
  .filter((f) => /^(src\/.*\.(ts|tsx)|[^/]+\.(ts|js))$/.test(f) && !/\.test\.ts$/.test(f))
  .map((f) => readFileSync(root + f, "utf8")).join("\n");

test("every file or folder the README points at exists", () => {
  const looksLikePath = (t: string) =>
    !/[*<>{}\s]/.test(t) && (/^(src|supabase|drizzle|public)\//.test(t) || /^[A-Za-z0-9_.$-]+(\/[A-Za-z0-9_.$-]+)*\.(ts|tsx|md|json|toml|lock|example)$/.test(t));
  // Files the README tells people to create (.env) or, on the npm route, to delete (bun.lock) may legitimately be absent.
  const paths = [...new Set(tokens.filter(looksLikePath))].filter((t) => ![".env", "bun.lock", "package-lock.json"].includes(t));
  assert.ok(paths.length >= 15, `only found ${paths.length} paths to check`);
  const missing = paths.filter((t) => {
    const bare = t.replace(/\/$/, "");
    return !(allFiles.includes(bare) || allDirs.includes(bare) || allFiles.some((f) => f.endsWith("/" + bare)) || allDirs.some((d) => d.endsWith("/" + bare)));
  });
  assert.deepEqual(missing, [], `README mentions files that do not exist: ${missing.join(", ")}`);
});

test("every environment variable the README names is listed in .env.example", () => {
  const vars = [...new Set(tokens.filter((t) => /^(AI_|ANTHROPIC_|OPENAI_|GOOGLE_|SUPABASE_|VITE_|DATABASE_|NITRO_)[A-Z0-9_]*$/.test(t) && t !== "VITE_"))];
  assert.ok(vars.length >= 6, `only found ${vars.length} variables`);
  const missing = vars.filter((v) => !new RegExp(`^#?\\s*${v}=`, "m").test(envExample));
  assert.deepEqual(missing, [], `README names variables missing from .env.example: ${missing.join(", ")}`);
});

test("every variable .env.example asks for is actually used by the code", () => {
  const defined = [...envExample.matchAll(/^#?\s*([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]);
  assert.ok(defined.length >= 12, `only found ${defined.length} variables`);
  const unused = defined.filter((v) => !sourceText.includes(v));
  assert.deepEqual(unused, [], `.env.example lists variables nothing reads: ${unused.join(", ")}`);
});

test("every command the README tells people to run exists in package.json", () => {
  const scripts = [...readme.matchAll(/\b(?:bun|npm) run ([a-z][a-z:-]*)/g)].map((m) => m[1]);
  assert.ok(scripts.includes("dev") && scripts.includes("test:node"));
  for (const s of new Set(scripts)) assert.ok(pkg.scripts[s], `package.json has no "${s}" script`);
  assert.ok(pkg.scripts.test && pkg.scripts["test:node"] && pkg.scripts.build && pkg.scripts.dev);
});

test("every screen in the sidebar is described in the README", () => {
  const sidebar = readFileSync(root + "src/components/app-sidebar.tsx", "utf8");
  const labels = [...sidebar.matchAll(/label:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(labels.length >= 9, `only found ${labels.length} sidebar labels`);
  const missing = labels.filter((l) => !readme.toLowerCase().includes(l.toLowerCase()));
  assert.deepEqual(missing, [], `README does not mention these screens: ${missing.join(", ")}`);
});

test("the README does not send people to look up values nothing uses", () => {
  assert.doesNotMatch(readme, /project ID/i);
  assert.doesNotMatch(envExample, /PROJECT_ID/);
});
