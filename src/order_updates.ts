import { z } from "zod";

export const orderUpdateSchema = z.object({
  orderId: z.string().min(1),
  accountId: z.string().min(1),
  from: z.enum(["checkout_pending", "paid", "fulfilling", "shipped"]),
  to: z.enum(["paid", "fulfilling", "shipped", "receipt_ready"]),
  message: z.string().min(1).max(280),
  requestId: z.string().uuid()
});

export type OrderUpdate = z.infer<typeof orderUpdateSchema>;

const allowedTransitions: Record<OrderUpdate["from"], readonly OrderUpdate["to"][]> = {
  checkout_pending: ["paid"],
  paid: ["fulfilling", "receipt_ready"],
  fulfilling: ["shipped", "receipt_ready"],
  shipped: ["receipt_ready"]
};

export function prepareOrderEvent(update: OrderUpdate) {
  if (!allowedTransitions[update.from].includes(update.to)) {
    throw new OrderTransitionError(update.from, update.to);
  }

  return {
    channel: `order:${update.orderId}`,
    event: "order.updated",
    data: {
      order_id: update.orderId,
      previous_status: update.from,
      status: update.to,
      message: update.message
    },
    account_id: update.accountId
  };
}

export class OrderTransitionError extends Error {
  readonly from: OrderUpdate["from"];
  readonly to: OrderUpdate["to"];

  constructor(from: OrderUpdate["from"], to: OrderUpdate["to"]) {
    super(`Order cannot move from ${from} to ${to}`);
    this.name = "OrderTransitionError";
    this.from = from;
    this.to = to;
  }
}
