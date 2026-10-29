# Statement Intelligence — a pricing tool template

A working application for reading card-processing merchant statements, normalising
them, and pricing them against your own cost base.

Upload a statement from an acquirer, and the app extracts every fee line, classifies
each card line into a standard category, strips pass-through interchange where it
applies, compares the result against your buy rates, and produces a proposal showing
the merchant's current cost versus yours.

Clone it, point it at your own Supabase project, add your rates, and build from there.

**New to the technical side?** Read *Set it up with an AI assistant* just below. You do
not need to write code. If you are comfortable in a terminal, skip to *Getting started*.

## Set it up with an AI assistant

An AI coding assistant, such as Claude Code or OpenAI's Codex, can do the technical work
while you answer its questions. Allow 30 to 45 minutes the first time.

**What you need**

- A computer (Windows, Mac or Linux) and an internet connection.
- Claude Code or Codex installed, each with its own account. Follow the install
  instructions on their websites.
- A free account at [Supabase](https://supabase.com). This is where your data is kept.
- An account with one AI provider (Anthropic, OpenAI or Google) and an *API key*, which is
  a long password that lets the app use their AI to read statements.
- One merchant statement to try. Use a **sample** statement, not a real customer's, until
  you have read the data warning under *Setup*, step 1.

**The steps**

1. **Make a folder and open the assistant in it.** Create an empty folder (for example
   "pricing-tool"), then start Claude Code or Codex from that folder.
2. **Bring in the project.** Type: *"Clone https://github.com/AI-pricing-tool/Pricingtool
   into this folder, read the README, and explain in plain English what you plan to do
   before you do it."*
3. **Install it.** Type: *"Install everything the README says and create my settings file
   from the example. Tell me which values I need to fill in and where to find each one."*
4. **Create your database.** In your Supabase account, choose *New project* and wait a
   minute for it to finish. The assistant will tell you which two values to copy from it
   (the project URL and the publishable key).
5. **Get your AI key.** Sign in to the provider you chose and create an API key. The links
   are in *Setup*, step 1.
6. **Put the values in your settings file.** The file is called `.env` and is created in
   step 3. Open it in any text editor and paste each value next to its name. Do this
   yourself rather than typing keys into the chat, and never share this file or post it
   online.
7. **Set up the database.** Type: *"Apply the database migrations to my Supabase project
   and guide me through any login it needs."* If that gets stuck, *Setup*, step 2 shows
   how to do the same thing by copying and pasting in the Supabase website.
8. **Start the app.** Type: *"Start the app."* Then open <http://localhost:8080> in your
   browser and create an account.
9. **Make yourself an admin.** New accounts cannot change buy rates until you do this.
   Ask the assistant for the one-line instruction in *Setup*, step 2.4 and run it in the
   Supabase *SQL Editor* with your own email address.
10. **Try it.** Enter your buy rates, upload a sample statement, and open the analysis.

**If something goes wrong.** Copy the message you see and ask the assistant: *"What does
this mean and how do I fix it?"* The most common cause is a missing or mistyped key. A
statement that cannot be read is marked **Failed**, with the reason shown beside it.

**Costs.** Supabase and the AI providers have free options for trying things out, and
the AI provider charges you for each statement it reads once you go beyond them. Check
their current pricing pages before you start.

## Why this exists

The interesting part of this codebase is not the UI. It is the accumulated statement
knowledge in `src/lib/` — the rules that turn inconsistent acquirer wording into data
you can price against. For example:

- Worldpay prints `Per` for **personal/consumer** cards, not business
- Some acquirers print `0.0082` meaning **0.82%**, so the rate is always recalculated
  as `fee ÷ value × 100` rather than trusted as printed
- Scheme summary rows (`VISA`, `MASTERCARD`) must be ignored when itemised product
  lines already describe the same sales, or turnover double-counts
- Global Payments product codes carry real ambiguity: `VPPD` can be consumer *or*
  commercial prepaid and is deliberately left for review rather than guessed
- On interchange-plus statements, network and interchange costs are pass-through and
  must be excluded, leaving only processor margin and genuine ancillary fees

Each of these is a wrong answer someone found and fixed. 72 tests hold them in place.
That's the part worth having.

## Getting started

**What you need first**

- [Bun](https://bun.sh) installed on your computer, or Node.js with npm. This was tested
  with Bun 1.4 and Node 22.
- An account with one AI provider (Anthropic, OpenAI or Google) and a free
  [Supabase](https://supabase.com) account. Both are explained under *Setup* below.
- About 30 minutes the first time.

**The short version**

1. Get an AI key (*Setup*, step 1).
2. Create a Supabase project and apply the migrations (step 2).
3. In the project folder, create your settings file and install the app:

   ```bash
   cp .env.example .env   # on Windows PowerShell: Copy-Item .env.example .env
   bun install            # or: npm install
   ```

4. Fill in `.env` (the comments in it say where each value comes from), then start the
   app with `bun run dev` and open <http://localhost:8080>.
5. Sign up, make yourself an admin (step 2.4), set your buy rates and upload a statement.

This project uses Bun. If you use npm instead, delete `bun.lock` first, run `npm install`
(it creates its own lockfile), and use `npm run dev` instead of `bun run dev`.

To check that everything is wired up, you can run the built-in tests (`bun test`, or
`npm run test:node` on plain Node).

## Setup

You need three things: an AI provider key, a Supabase project, and (optionally) Google
OAuth for social sign-in. `.env.example` lists every variable and where to get it.

### 1. Pick an AI provider and get a key

Statement extraction calls one AI provider, chosen with the `AI_PROVIDER` variable.
Pick one and set only its key:

| Provider | `AI_PROVIDER` | Key variable | Get a key | Default model (override with) |
| --- | --- | --- | --- | --- |
| Anthropic (Claude) | `anthropic` | `ANTHROPIC_API_KEY` | [Anthropic Console](https://console.anthropic.com/settings/keys) | `claude-sonnet-5-5` (`ANTHROPIC_MODEL`) |
| OpenAI | `openai` | `OPENAI_API_KEY` | [OpenAI Platform](https://platform.openai.com/api-keys) | `gpt-6.1-sol` (`OPENAI_MODEL`) |
| Google (Gemini) | `google` | `GOOGLE_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) | `gemini-3.8-flash` (`GOOGLE_MODEL`) |

If no provider is configured, uploading a statement fails with a message that lists these
variables. The provider code lives in `src/lib/ai-provider.ts`. The model must accept PDF
input, and extraction quality differs between models, so try your own statements before
relying on a provider. Model ids move quickly: the defaults above were checked on
2026-10-28 and may need updating, which is what the `*_MODEL` variables are for.

> **Free tiers are for trying it out, not for real customer data.** Free tiers exist and
> are fine for a demo with sample statements. Real customer statements should go through
> a paid tier, because free tiers may use submitted data for model training. Check your
> provider's current data-use terms before uploading anything real.

The adapters also ask providers not to store requests where the API has a switch for it:
`store: false` for OpenAI and for Gemini (Gemini stores requests by default for projects
created on or after 2026-10-26). That does not override a provider's own abuse-monitoring
retention or free-tier data-use terms, so the paid-tier advice above still applies.

### 2. Create a Supabase project and apply the migrations

1. Create a project at the [Supabase dashboard](https://supabase.com/dashboard).
2. Copy the project URL and publishable key into `.env`, each twice: once as written and
   once with the `VITE_` prefix (see `.env.example`).
3. Apply the migrations in `supabase/migrations/`, in order. Either use the Supabase CLI:

   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```

   or paste each file into the dashboard's SQL Editor, oldest first. They create the
   schema, the private `statements` storage bucket and the seeded reference data,
   including the card taxonomy (`canonical_categories`: UK, EU, non-EU and US card
   types) that every statement line is mapped to and every buy rate is priced against.

   The `drizzle/` folder holds three earlier migrations. Two of them (the `us` and
   `discover` enum values, and `statements.currency`) are now repeated in
   `supabase/migrations/`, so you don't need them. The third (`0000`) narrows who can
   read the reference tables; it is optional and the Supabase CLI does not apply it.
4. Make yourself an admin. Sign up in the app first (the sign-up form also creates your
   organisation), then run this in the SQL Editor with your own email. New accounts are
   resellers, and only a `super_admin` can edit buy rates and the taxonomy:

   ```sql
   with u as (select id from auth.users where email = 'you@example.com'),
        d as (delete from public.user_roles where user_id in (select id from u))
   insert into public.user_roles (user_id, role)
   select id, 'super_admin' from u;
   ```

**Email confirmation.** Supabase asks new users to confirm their email address by default.
After signing up you are taken to the sign-in page with a reminder to check your inbox;
click the link in the email, then sign in. For a quick local test you can switch this off
in the Supabase dashboard, under *Authentication → Sign In / Providers → Email*.

### 3. Google sign-in (optional)

Email and password sign-in work without this. For the "Continue with Google" button:

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an
   OAuth client ID of type *Web application*. Add
   `https://<your-project-ref>.supabase.co/auth/v1/callback` as an authorised redirect URI.
2. In Supabase, open *Authentication → Sign In / Providers → Google*, enable it and paste
   the client ID and secret.
3. In *Authentication → URL Configuration*, set the Site URL and add
   `http://localhost:8080/**` and your production URL to the redirect URLs.

If you don't want social sign-in, remove `<GoogleButton />` from `src/routes/login.tsx` and
`src/routes/signup.tsx`.

### 4. Run locally

```bash
bun run dev          # http://localhost:8080
```

Sign up, make yourself an admin (step 2.4), enter your buy rates on the *Buy rates* screen,
then upload a statement and check that extraction completes. If a statement can't be read,
it is marked **Failed** and the reason is shown on its analysis page and as a tooltip in the
statements list. Fix the cause (usually the AI key), then use **Re-extract**.

**What's in the app**

- **Dashboard**: an overview. The counts and money totals are real, but the small percentage changes ("12% this month", "8.4%") and the "Mapping confidence" figure (94.2%) are sample values, not calculated from your data.
- **Statements**: every uploaded statement and its status.
- **Upload**: add a statement (PDF, CSV, Excel or image) for a merchant.
- **Pipeline**: your merchants and where each one is in the sales process.
- **Proposals**: the Word proposals you have generated.
- **Forecasting**: partner forecasting, using sample data until you replace it.
- **Admin only** (needs step 2.4): *Manage users*, *Taxonomy* (the card categories),
  *Mapping dictionary* (how statement wording maps to those categories) and *Buy rates*
  (your costs).

### 5. Deploy to Vercel

1. Push the repository to GitHub and import it at [vercel.com/new](https://vercel.com/new).
2. In *Project Settings → Environment Variables*, add the Supabase variables (both the
   plain and `VITE_` ones), `AI_PROVIDER` and the matching key. `VITE_` values are baked
   in at build time, so redeploy after changing them. `DATABASE_URL` is not needed at
   runtime.
3. The build packages the server with Nitro. `vite.config.ts` defaults to the `vercel`
   preset; set `NITRO_PRESET` to target another host.
4. Add your Vercel URL to the Supabase redirect URLs from step 3.

Extraction runs inside a request and large PDFs make several AI calls, so check your
Vercel plan's function time limit if long statements time out.

---

**Everything below is for whoever customises the code. If you only want to try the app,
you can stop here.**

## Stack

TanStack Start (React 19, TypeScript, Vite) · Tailwind CSS v4 · shadcn/ui · Recharts ·
Supabase (Postgres, Auth, Storage) · Drizzle for migrations

## How a statement becomes a proposal

```
upload  →  extract  →  map  →  analyse  →  propose
```

1. **Upload** (`src/lib/statements.functions.ts`) — a PDF, image, CSV or Excel file is
   stored, then sent to the AI provider you configured (Anthropic, OpenAI or Google) with a
   structured extraction schema. PDFs over
   six pages are split into batches and processed in parallel. Multi-site statements
   keep every line tagged to its site MID.
2. **Extract** — returns statement, site and line records: raw description exactly as
   printed, transaction count and value, fee, scheme hint, section heading.
3. **Map** (`mapping-engine.ts`, `global-payments-codes.ts`) — each raw description is
   resolved to a canonical category. Order matters: product-code rules first, then the
   dictionary, then deterministic classification, then scheme-only as a last resort.
   Anything ambiguous stays unmapped for human review rather than being guessed.
4. **Analyse** (`interchange-plus.ts`, `routes/_authenticated/analyses.$id.tsx`) —
   pass-through rows are stripped where the statement is interchange-plus, card lines
   are priced against buy rates, and margin and savings are calculated.
5. **Propose** (`proposals.functions.ts`) — generates a Word document comparing current
   and proposed pricing.

## Project structure

```
src/
  lib/
    statements.functions.ts     upload, PDF batching, AI extraction, persistence
    ai-provider.ts              Anthropic / OpenAI / Google adapter behind one function
    mapping-engine.ts           description → canonical category resolution
    global-payments-codes.ts    product code dictionary and ambiguity rules
    interchange-plus.ts         pass-through exclusion, US classification, currency
    buy-rates.functions.ts      privileged buy-rate writes
    proposals.functions.ts      proposal calculation and Word generation
    *.test.ts                   the statement-rule test suite
    forecasting/                partner forecasting: data, helpers, state, persistence
  config/
    template-config.ts          commercial assumptions — set these first
  routes/
    _authenticated/             every signed-in screen
  components/                   shared UI and charts
  integrations/                 Supabase client, auth
supabase/migrations/            schema and seeded reference data
```

### Working on this with an AI coding assistant

Point it at `src/config/template-config.ts` and this README first, and ask it to
confirm your commercial settings before it changes anything else. The values shipped
in that file are arbitrary examples — an assistant has no way to know yours.

Treat `src/lib/*.test.ts` as the specification for the statement rules. If a change
breaks a test, the change is usually wrong — those assertions encode real acquirer
behaviour that is not obvious from reading the code.

## Make it yours

Five things to set before the numbers mean anything. None of them will raise an
error if left alone; the app will simply be describing someone else's business.

| What | Where |
| --- | --- |
| Commission split between platform and partner | `src/config/template-config.ts` |
| Margin target and the green/amber/red thresholds | `src/config/template-config.ts` |
| Per-transaction sell defaults and growth assumptions | `src/config/template-config.ts` |
| Your buy rates | added in the app, on the Buy rates screen |
| Your forecast data and its date range | `src/lib/forecasting/actuals.ts`, `forecasts.ts` |

### Using your own forecasting data

Three files are joined by a **string id** and must stay in sync:

- `forecasting/mock-data.ts` — the partner catalogue (`RESELLERS`)
- `forecasting/actuals.ts` — historical figures
- `forecasting/forecasts.ts` — forward figures

A mismatched id shows that partner as zero rather than failing, so check them when
you swap your data in.

**Units:** forecasting turnover and commission are in **thousands**. A stored `1000`
means 1,000,000.

**Date range:** `FORECAST_START`, `FORECAST_END`, `ACTUAL_START` and `ACTUAL_END` are
constants in those two files, and the month axis is built from them. Move your data
outside that window and the charts come back empty.

### Sample data

Everything in `src/lib/forecasting/` is synthetic — invented partner names and
generated figures, there so the charts render. The test fixtures likewise use made-up
statements in a realistic layout. None of it describes a real business.

- Actuals and forecasts both contain June and July 2026 so the two series can be
  compared at the boundary. Forecast values continue on from the actuals, so the
  charts join without a visible step.
- `FORECASTS_EUR` holds a second-currency series for two partners. Nothing
  currently consumes it — wire it up or delete it.
- The `bps` field on each partner in `RESELLERS` is a fallback used only when a
  partner has no actuals. The shipped values are computed from the sample data so
  they agree with it.

## Left open for you

Deliberately unfinished, and flagged with `// TODO (template):` in the source:

- **Dashboard headline deltas** and the mapping-confidence and learning-engine figures
  are static display values. Wire them to real queries or remove the tiles.
- **Transaction counts** on the Volumes & values screen are estimated from turnover by
  a fixed multiplier. Replace with real counts when you have them.
- **Per-item defaults** differ between the analysis screen and the proposal generator.
  Set both from `template-config.ts` so a proposal always matches the page it came from.
- **Proposal card handling** recognises Visa, Mastercard and Maestro; the analysis
  screen also handles Amex and Discover. Bring the proposal path in line if you need
  US output.
- **Forecast streams** — four are saved, and the reporting helpers currently read
  turnover. Extend the helpers to consume the rest as you need them.

These are the natural next pieces of work rather than hidden traps, and each is a
contained change.

## Naming note

The two commission streams are `PLATFORM_COMMISSION_SHARE` and
`PARTNER_COMMISSION_SHARE` in config. Some internal names in the forecasting code, the
styling and the database enum come from the original build and do not match those
labels. No user-visible text uses them. Rename them if you prefer, but change the
TypeScript, the CSS custom properties and the database enum together.

## Licence

MIT. See [LICENSE](LICENSE).
