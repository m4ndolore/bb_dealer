# SigmaBlox AI Playbook (Single Source of Truth)

Use this file only. All other AI docs in this folder defer here.

## How We Work
- Contributor mindset: practice context discipline (only relevant context, no history retelling), prefer deletion over addition, keep diffs minimal.
- Runtime config reads directly from `process.env`; no runtime YAML loading, no config managers, no new env abstractions.
- Containers are the default runtime; use Docker service names, never `localhost`, for inter-service calls.
- Allowed env helpers only:
  ```js
  export const requireEnv = (key) => {
    const value = process.env[key];
    if (!value) throw new Error(`Missing required env var: ${key}`);
    return value;
  };
  export const optionalEnv = (key, fallback = undefined) =>
    process.env[key] ?? fallback;
  ```

## Configuration & Secrets Contract
- Non-secrets live in `config/*.yaml` (build-time only) → rendered via `scripts/render-env.js <profile>` → `.runtime/<profile>.env` → consumed by services/CI (`--env-vars-file` for Cloud Run, `env_file` for docker-compose).
- Secrets belong only in Google Secret Manager (prod/vm) or `.env.local` (dev). Reference secrets by name; never print or paste values in code, logs, or summaries.
- Do not introduce new required env vars silently. No runtime YAML, no `config.get(...)`, no fallback defaults that hide missing config, no ad-hoc Cloud Run UI edits.
- `config/doctor.js` is authoritative; app must not start if Doctor fails.

## Networking, URLs, and Theming
- Required URL vars: `PUBLIC_BASE_URL`, `GHOST_URL`, `EXTRA_CORS_ORIGINS` (optional list). Use Docker service names, not `localhost`, for internal calls. Do not derive URLs from headers or hardcode them in JS, HBS, Docker, or CI.
- Ghost theme config comes from rendered JS (e.g., `window.SigmaBloxConfig.apiBase`). No hostname heuristics or Ghost Admin UI overrides. If config is missing, fail loudly (console error + abort).

## Webhook & Ghost API Rules
- Webhook runs only in Docker (dev/prod); read env vars once and avoid re-declaring.
- Ghost API calls must send `Authorization: Ghost <token>` and `Accept-Version` (default from `GHOST_API_VERSION`, default `v5.0`). On failures, log status, content-type, and first 200 chars before calling `response.json()`.
- Airtable endpoints are gated by `ENABLE_AIRTABLE_SYNC=true` (default off); error messages should reference `.env.local`.

## SSO / Login (OpenPass Prototype)
- Single backend entrypoint: `GET /auth/sso/start` that validates provider (e.g., `google`, `cac_piv`), sanitizes `returnTo` (same-origin allowlist), persists execution context, redirects to Authentik, restores session, then redirects to `returnTo`. Do not add multiple SSO endpoints or new identity concepts.
- Frontend buttons (portal modal and `/join`) should link to `${apiBase}/auth/sso/start?provider=<provider>&returnTo=<encoded>`. `apiBase` must come from injected config (`window.SigmaBloxConfig.apiBase`), not hardcoded hosts.

## Authentik Alignment (Infra Parity)
- Authentik repo mirrors the same env pattern: non-secrets in `config/base.yaml` + profile YAML, rendered with `scripts/render-env.js` to `.runtime/dev.env`; secrets in `.env.local` (dev) or `/opt/authentik/.env` (prod/vm).
- `docker-compose.authentik.yaml` consumes env via `env_file` (runtime + secrets) while environment entries resolve from those vars. Hyphenated env names must be normalized (e.g., `CF-Access-Client-Id` → `CF_ACCESS_CLIENT_ID`).
- Provide `config/schema.js`, `config/doctor.js`, and `.env.local.example` (secrets only); `.runtime/` and `.env.local` stay gitignored.

## Deployment & CI/CD Guardrails
- Cloud Run: use rendered env file for non-secrets and `--set-secrets` for GSM secrets. No inline heredocs or duplicated CI jobs. Fix the render pipeline instead of patching runtime values.
- Ghost VM: docker-compose must use
  ```
  env_file:
    - .runtime/prod.env
    - .ghost.secrets.env
  ```
  CI renders `.runtime/prod.env`, fetches secrets into `.ghost.secrets.env`, and restarts compose. Manual VM edits are temporary breakage, not solutions.

## Reporting & Safety
- When describing work, reference config keys and secret IDs, never values. Call out remaining drift explicitly. If a requested change conflicts with these rules, flag it and propose a compliant alternative. Stop and ask when unsure.
