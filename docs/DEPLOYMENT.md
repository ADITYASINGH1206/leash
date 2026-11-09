# Deploying Leash on Render

This guide covers hosting the console and gateway on Render, the one manual step that makes the console talk to the gateway, and how to diagnose the most common failure: a console that says "The gateway is offline" with "Gateway returned 404".

## What gets deployed

`render.yaml` defines five web services, all on Render's free plan.

| Service | Runtime | Purpose |
| :-- | :-- | :-- |
| `leash-gateway` | Node 22 | Decision engine, MCP endpoint, REST API, ledger, background jobs |
| `leash-console` | Node 22 (Next.js) | Homepage, Judge mode, console, approvals app |
| `leash-buyer-agent` | Node 22 | Chat-driven shopping agent with Attack Mode (embeds the engine in-process) |
| `leash-stores` | Node 22 | Demo storefronts: GadgetHub, TrendBoutique, DailyMart |
| `leash-ml` | Python 3.11 | Optional risk-score service. The gateway falls back to a local scorer without it. |

The Blueprint runs the gateway with `LEASH_STORAGE=memory`. State (mandates, transactions, ledger) is held in memory and resets when the service restarts or Render spins it down. The Postgres-backed path cannot yet store mandates, so it is not used for the hosted demo; see "Storage" below. The Blueprint therefore does not provision a `leash-db` database; the definition is left as a comment at the bottom of `render.yaml`.

## Step by step

1. **Create the Blueprint.** In Render, choose New, then Blueprint, and point it at this repository. Apply it.
2. **Find the gateway's real public URL.** Open the `leash-gateway` service in the dashboard and copy the URL shown under its name. Do not type it from memory (see "Why the name may not be yours" below).
3. **Check it is a Leash gateway.**

   ```bash
   curl https://<your-gateway-url>/health
   ```

   A real gateway answers:

   ```json
   {"status":"ok","service":"leash-gateway","ledgerHeight":0,"paypalMode":"mock","storage":"memory","timestamp":"..."}
   ```

   If you get anything else (a different JSON shape, HTML, a 404), you are not talking to your gateway. Go back to step 2.
4. **Tell the console where the gateway is.** On `leash-console`, set `NEXT_PUBLIC_GATEWAY_URL` to that URL, with the `https://` scheme and no trailing slash.
5. **Allow the console to call the gateway.** On `leash-gateway`, set `CORS_ORIGINS` to the console's public URL (for example `https://leash-console.onrender.com`). Separate several origins with commas.
6. **Redeploy the console with the cache cleared.** Choose "Clear build cache and deploy" on `leash-console`. `NEXT_PUBLIC_*` variables are inlined into the browser bundle when the console is built, so changing the variable alone has no effect on an existing build.
7. **Verify.** Open `https://<your-console-url>/judge`. The status line should read "Gateway live at ...", and "Start the walkthrough" should complete all seven steps.

Optional: set `LEASH_USER_TIMEZONE` on the gateway to the timezone you will demo in (the quiet-hours rule holds purchases between midnight and 6 AM local time), and the `PAYPAL_*` variables to use the PayPal sandbox instead of mock mode.

## Why the name may not be yours

Render service names map to the public hostname `<name>.onrender.com`, and those hostnames are global across all Render accounts. If another account already has a service called `leash-gateway`, Render gives yours a suffix (for example `leash-gateway-ab12.onrender.com`). The plain `https://leash-gateway.onrender.com` then belongs to the other account.

If `NEXT_PUBLIC_GATEWAY_URL` was set to the plain name, the console is talking to a stranger's service. It will receive 200 or 404 responses that are not Leash API responses, which is what produces:

> The gateway is offline, so this is recorded sample data. ... Last error: Gateway returned 404

Older console builds also reported such a service as "live" if it happened to answer `/health` with any JSON. Current builds require `/health` to identify itself as `"service":"leash-gateway"`, and show "Wrong gateway URL" when it does not.

## Diagnosing from the outside

| What you see | Likely cause | Fix |
| :-- | :-- | :-- |
| Console banner: "Gateway returned 404 for /api/v1/..." or badge "Wrong gateway URL" | `NEXT_PUBLIC_GATEWAY_URL` points at a host that is not your gateway | Steps 2 to 6 above |
| "Could not reach the gateway at ..." | Gateway is down or asleep, or the URL has a typo | Open the gateway's logs in Render; free instances need up to a minute to wake |
| Same message, and `curl <gateway>/health` works | The console's origin is missing from `CORS_ORIGINS` | Step 5; the browser console shows a CORS error |
| `curl <gateway>/health` returns 500, "Database unavailable ... (Fail-Closed)" | `DATABASE_URL` is set but the database is empty or unreachable | Remove `DATABASE_URL`, set `LEASH_STORAGE=memory`, or run `pnpm db:migrate` |
| Console shows the right URL but the old wrong one is still used | The console was not rebuilt after the change | Step 6 |

## Storage

The gateway reports its mode as `storage` in `/health`.

- `memory`: everything lives in the process. This is what the Blueprint uses. A restart empties the ledger.
- `postgres`: set `DATABASE_URL` and remove `LEASH_STORAGE`. On start the gateway applies the SQL migrations in `apps/gateway/drizzle` (or run `pnpm db:migrate`), then reads and writes the ledger and transactions in Postgres.

The Postgres mode currently stops short of a working demo: mandates are created in memory only and the schema has no place for their constraints, so the first payment fails on a foreign key. Until mandate persistence is added, use memory storage for hosted demos. When that work lands, add the `leash-db` database back, restore the `DATABASE_URL` block in `render.yaml`, and delete `LEASH_STORAGE`.

## Service health checks

The Blueprint sets `healthCheckPath` to `/health` for the gateway and `/` for the console, so Render only routes traffic to an instance that is actually serving.

## Free-tier behavior

Free instances sleep after a period of inactivity. The first request after a sleep takes up to a minute while the service starts, during which the console reports the gateway as unreachable. Open the gateway's `/health` URL once before a live demo to warm it, and expect the in-memory state to be empty after every wake.

## Other ways to host it

**Console on Vercel, backend elsewhere.** Deploy `apps/console` to Vercel (root directory `apps/console`, build command `pnpm build`) with `NEXT_PUBLIC_GATEWAY_URL` set to the gateway's public URL, and run the gateway on Render, Fly.io, Railway or any Node host with `CORS_ORIGINS` set to the Vercel URL. The same rules apply: the variable is read at build time, and the gateway must answer `/health` with `"service":"leash-gateway"`.

**Run it yourself.**

```bash
pnpm install && pnpm build
node apps/gateway/dist/server.js                                   # gateway (PORT, default 4000)
NEXT_PUBLIC_GATEWAY_URL=https://gateway.example.com pnpm --filter=@leash/console build
pnpm --filter=@leash/console start                                 # console (PORT, default 3000)
node apps/stores/dist/index.js                                     # storefronts (default 3003)
node apps/buyer-agent/dist/index.js                                # buyer agent (default 4001)
uvicorn services.ml.main:app --host 0.0.0.0 --port 8000            # risk service (optional)
```

Set `LEASH_STORAGE=memory` on the gateway and buyer agent when `NODE_ENV=production` and no database is configured; otherwise every request fails closed.
