import assert from "node:assert/strict";
import test from "node:test";
import { OrderTransitionError, prepareOrderEvent } from "../src/order_updates.js";

test("a paid order can enter fulfillment and targets its private order room", () => {
  const event = prepareOrderEvent({
    orderId: "ord_2048",
    accountId: "shop_17",
    from: "paid",
    to: "fulfilling",
    message: "Your order is being packed.",
    requestId: "8fdaf44c-e21f-42cb-9ee7-4d61d6ffbe99"
  });

  assert.equal(event.channel, "order:ord_2048");
  assert.equal(event.event, "order.updated");
  assert.equal(event.data.status, "fulfilling");
});

test("an order cannot skip from checkout to shipping", () => {
  assert.throws(
    () =>
      prepareOrderEvent({
        orderId: "ord_2048",
        accountId: "shop_17",
        from: "checkout_pending",
        to: "shipped",
        message: "Your order has shipped.",
        requestId: "8fdaf44c-e21f-42cb-9ee7-4d61d6ffbe99"
      }),
    OrderTransitionError
  );
});
