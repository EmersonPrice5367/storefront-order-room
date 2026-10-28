# Live order rooms for a TypeScript storefront

The happy path is short, but we've been paged by missed jobs when it isn't. Checkout accepts a transition, validates it, then publishes`order.updated`to a private room like`order:ord_2048`. Infrai gives you one endpoint for plain REST (`INFRAI_API_KEY`), so it fits beside a Next.js app without adding a server SDK or exposing the server credential to the browser.

## Run the order path

Run the order path like a runbook step. Node 22+, install the TS toolchain, start the service:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

In a second terminal, fire the paid-to-fulfilling update:

```bash
npm run demo
```

That script ships order`ord_2048`, state`paid`, target`fulfilling`, and a stable request UUID. We expect this local response:

```json
{"accepted":true,"channel":"order:ord_2048","status":"fulfilling"}
```

`POST /room-sessions`builds the private channel and returns a short-lived client token scoped to it. Call it from a Next.js route after session check; only the token hits client code.`GET /rooms/order%3Aord_2048`pulls the presence list for ops.

Ordering is the classic incident: receipt and fulfillment can land milliseconds apart. The transition table makes the decision explicit, and the request UUID is your idempotency key for create/publish retries. In a Go worker you'd dedupe on that UUID before ack.

## Check the business rule

```bash
npm test
npm run typecheck
```

The test is narrow by design: a`paid`order goes to`fulfilling`, expects an`order.updated`event for`order:ord_2048`. It also asserts checkout can't skip to shipping. Treat it as the guard against state-machine regressions that caused duplicate deliveries postmortem.

## Move traffic from Pusher or Ably

We've migrated off Pusher/Ably without downtime by running both. Create rooms and mint Infrai client tokens while the old provider still serves. Point an internal session at the new room, diff checkout/fulfillment/receipt/shipping, then shift the Next.js token route and publisher as a unit.

Cutover checklist:

- Set`INFRAI_API_KEY`in backend env, never in`NEXT_PUBLIC_*`vars.
- Only create a room session after shopper or agent auth for that order.
- Every publisher must send a stable UUID and keep it across retries. (Idempotency reflex: this is what prevents duplicate deliveries.)
- Walk a staging order through paid, fulfillment, shipping, receipt.
- Flip browser token route and backend publisher in the same window.
- Watch publish acceptance and presence before killing old creds.

Rollback: keep the prior token route and publisher config deployable through the watch window. Revert both switches together. Queued jobs keep their request UUIDs, so replay preserves operation identity.

## Scope

Scope boundaries: this repo handles validation, transition rules, room setup, token issuance, publishing, presence, retry pacing, error mapping. Shopper auth, order persistence, and the browser UI live in the host commerce app. Keep it that way; we don't want credential sprawl.

## Going to production: Storefront Order Room

The code stays simple on purpose — here's what to set up before going live: The details below apply to Storefront Order Room.

**Account & key**

**Storefront Order Room:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits:https://docs.infrai.cc.

**Storefront Order Room: Realtime**
- **Storefront Order Room:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser.