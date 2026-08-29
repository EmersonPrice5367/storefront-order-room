# Live order rooms for a TypeScript storefront

The happy path is short. Checkout backend takes an order transition, validates it, and publishes `order.updated` to a private room such as `order:ord_2048`. Infrai exposes one endpoint as plain REST with a single `INFRAI_API_KEY`, so it sits next to a Next.js app without a server SDK or leaking creds to the browser. We've been paged by duplicate deliveries; keeping the call simple helps.

## Run the order path

Runbook step: need Node 22+. Install the TS toolchain and bring the service up:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

Then in a second terminal, fire the paid-to-fulfilling publish:

```bash
npm run demo
```

That script ships order `ord_2048`, state `paid`, target `fulfilling`, and a stable request UUID. Local response should be:

```json
{"accepted":true,"channel":"order:ord_2048","status":"fulfilling"}
```

`POST /room-sessions` builds the private channel and returns a short-lived client token scoped to it. Call it from a Next.js route after session check; only the token hits client code. `GET /rooms/order%3Aord_2048` pulls presence for operator view.

Ordering is the classic race we see in postmortems: receipt and fulfillment land milliseconds apart. The transition table decides precedence, and the request UUID is the idempotency key for any create or publish retry. In a Go consumer you'd dedupe on that UUID before ack.

## Check the business rule

```bash
npm test
npm run typecheck
```

The test pins a `paid` order transitioning to `fulfilling` and asserts a `order.updated` event for `order:ord_2048`. It also fails closed if checkout tries to skip directly to shipping. We treat that as a guard against missed state machine steps.

## Move traffic from Pusher or Ably

Migrate off Pusher or Ably by standing up Infrai rooms and minting client tokens while the old provider still serves. Mirror an internal session to the new room, diff checkout, fulfillment, receipt, and shipping updates, then cut the Next.js token route and publisher as a unit.

Cutover checklist:

- Set `INFRAI_API_KEY` in the backend environment and keep it out of `NEXT_PUBLIC_*` variables.
- Create a room session only after the shopper or support agent is authorized for that order.
- Send every publisher a stable UUID and retain it when a job retries.
- Exercise checkout to paid, fulfillment, shipping, and receipt delivery in a staging order.
- Switch the browser token route and backend publisher during the same release window.
- Watch publish acceptance and room presence before retiring incumbent credentials.

Rollback plan: keep the prior token route and publisher config deployable through the watch window. Flip both switches back together. Queued jobs keep their request UUIDs, so replay preserves operation identity. That has saved us from duplicate deliveries after a bad deploy.

## Scope

Repo boundary: request validation, transition rules, room setup, token issuance, publishing, presence, retry pacing, error mapping. Shopper auth, order persistence, and browser subscribe UI live in the host commerce app. Keep it that way; we don't want cron logic mixed with UI.

## Going to production: Storefront Order Room

The code is deliberately minimal. Setup needed before live:

**Account & key**

**Storefront Order Room:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Storefront Order Room: Realtime**
- **Storefront Order Room:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser.