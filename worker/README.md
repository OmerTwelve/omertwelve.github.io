# Cloudflare Workers backend

The portfolio stays on GitHub Pages. This directory deploys a JavaScript Worker
with the same `/api/health` and `/api/ask` endpoints as the local Python backend.
It bundles all notes from `rag/knowledge/` and sends them to DeepSeek as context.
It does not run FastEmbed, use `backend/kb.json`, or return ranked retrieval sources.
Every accepted question can incur an API call, including off-topic questions.
Rebuild/redeploy after editing the notes. This larger context costs more tokens
than the Python backend's top-five retrieval; the usage meter uses actual API usage.

## Deploy from PowerShell

Install Node.js, then run from the repository root:

```powershell
cd worker
npm.cmd install
npx.cmd wrangler login
npx.cmd wrangler secret put DEEPSEEK_API_KEY
npm.cmd run deploy
```

Paste the key at the secret prompt. Never put it in `wrangler.jsonc` or frontend
code. Wrangler may ask to create the Worker when adding its first secret.
The Worker uses a SQLite Durable Object for persistent, globally coordinated
rolling rate limits. Check your Cloudflare account's Workers/Durable Objects
plan availability and usage pricing before deploying.

`backend/.env` is local to the Python service and is not read or uploaded here.
Public settings are in `wrangler.jsonc`: `GLOBAL_PER_DAY=400`, `RATE_PER_DAY=60`,
`RATE_PER_MINUTE=6`, allowed origins, model, and cost-meter prices. Adjust these
there before deployment; the price values are estimates, not billing limits.

Wrangler prints a URL such as
`https://omer-portfolio-assistant.YOUR-SUBDOMAIN.workers.dev`.
Set the production URL in `../js/config.js` to that exact URL (no trailing slash),
then commit/push the frontend update for GitHub Pages.

Visit `YOUR-WORKER-URL/api/health`; confirm `key_configured` is `true`.
Open the GitHub Pages terminal and send a question to check end-to-end streaming.
If you add a custom portfolio domain, add its exact origin to `ALLOWED_ORIGINS`.

## Cloudflare Git integration

Connect this GitHub repository as a Worker project. Set its root directory to
`worker`, build command to `npm run build`, and deploy command to
`npx wrangler deploy`. Add `DEEPSEEK_API_KEY` under the deployed Worker's
**Settings > Variables and Secrets** as a secret. It is a runtime secret,
not a frontend build variable.

## Local checks

```powershell
npm.cmd test
npm.cmd run build
npx.cmd wrangler deploy --dry-run
```

For local Worker development, create a gitignored `worker/.dev.vars` containing
`DEEPSEEK_API_KEY=...`, then run `npm.cmd run dev`. To connect the local frontend,
set its localhost API URL to the port printed by Wrangler (usually 8787), or run
Wrangler with `--port 8000` to match the existing frontend configuration.

The existing Python backend remains available for local vector retrieval.
