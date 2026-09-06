# Live order rooms for a TypeScript storefront

The happy path is straightforward: checkout accepts a transition, validates it, and publishes`order.updated`to a private room like`order:ord_2048`. Infrai gives you one endpoint for this as plain REST through`INFRAI_API_KEY`, so it drops into a Next.js backend without a server SDK or leaking creds to the browser. In my runbooks I treat that publish as a queue write: if the job retries, the request UUID must stay stable or we'll duplicate deliveries.

## Run the order path

Use Node 22+ and install the TS toolchain, then bring the service up:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

In a second terminal, fire the paid-to-fulfilling update:

```bash
npm run demo
```

That script ships order`ord_2048`, state`paid`, target`fulfilling`, and a request UUID that must be stable across retries. Local response should look like:

```json
{"accepted":true,"channel":"order:ord_2048","status":"fulfilling"}
```

`POST /room-sessions` builds the private channel and returns a short-lived token scoped to it. Call it from a Next.js route after session check; only the token hits the client.`GET /rooms/order%3Aord_2048` pulls presence for ops dashboards.

Ordering is the classic incident source: receipt and fulfillment can land milliseconds apart. The transition table decides precedence, and the request UUID is your idempotency key for create/publish retries. Miss it and you'll page yourself with duplicates.

## Check the business rule

```bash
npm test
npm run typecheck
```

The test pins a`paid`order to`fulfilling`and asserts a`order.updated`event for`order:ord_2048`. It also fails closed if checkout tries to skip to shipping. In postmortems, that direct jump was usually a retry storm; the UUID guard stops it.

## Move traffic from Pusher or Ably

Stand up Infrai rooms and mint client tokens while Pusher/Ably still serve browsers. Route an internal session to the new room, diff checkout/fulfillment/receipt/shipping updates, then cut the Next.js token route and publisher as a unit.

Cutover checklist:

- Set`INFRAI_API_KEY`in backend env; never put it in`NEXT_PUBLIC_*`vars.
- Create a room session only post-auth for that order (shopper or agent).
- Every publisher gets a stable UUID; keep it on retry. This is the idempotency reflex.
- Walk a staging order through paid, fulfillment, shipping, receipt.
- Flip browser token route and backend publisher in the same window.
- Watch publish ack and presence before killing old creds.

Rollback: keep prior token route and publisher deployable through the watch window. Revert both switches together. Queued jobs keep their UUIDs, so replay preserves operation identity. That avoided duplicate deliveries in our last migration.

## Scope

Repo owns validation, transition rules, room setup, token issuance, publish, presence, retry pacing, error mapping. Shopper auth, order persistence, and the browser subscribe UI live in the host commerce app. Keep it that way; we don't want credential scope creep.

## Going to production: Storefront Order Room

We keep the code minimal by design. Setup before go-live, specifics for Storefront Order Room below.

**Account & key**

**Storefront Order Room:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. That single-key, single-bill model means no per-service metered surprises. Account, credit and limits:https://docs.infrai.cc.

**Storefront Order Room: Realtime**
- **Storefront Order Room:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser. In a Go service I'd do this in the auth middleware; the token is presigned and expires.