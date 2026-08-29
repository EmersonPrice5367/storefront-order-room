import { createServer } from "node:http";
import { InfraiError, InfraiRealtime } from "./infrai_realtime.js";
import {
  OrderTransitionError,
  orderUpdateSchema,
  prepareOrderEvent
} from "./order_updates.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

const realtime = new InfraiRealtime(apiKey);
const port = Number(process.env.PORT ?? 3000);

const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/order-updates") {
      const update = orderUpdateSchema.parse(await readJson(request));
      const event = prepareOrderEvent(update);
      await realtime.publish(event, update.requestId);
      return sendJson(response, 202, { accepted: true, channel: event.channel, status: update.to });
    }

    if (request.method === "POST" && request.url === "/room-sessions") {
      const input = roomSessionSchema.parse(await readJson(request));
      const channel = `order:${input.orderId}`;
      await realtime.createChannel(channel, input.requestId);
      const session = await realtime.issueToken(input.clientId, [channel]);
      return sendJson(response, 201, { channel, token: session.token });
    }

    if (request.method === "GET" && request.url?.startsWith("/rooms/")) {
      const channel = decodeURIComponent(request.url.slice("/rooms/".length));
      const result = await realtime.presence(channel);
      return sendJson(response, 200, result);
    }

    return sendJson(response, 404, { error: "Route not found" });
  } catch (error) {
    if (error instanceof OrderTransitionError) {
      return sendJson(response, 409, { error: error.message });
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      return sendJson(response, status, { error: error.message, code: error.code });
    }
    if (error instanceof Error && error.name === "ZodError") {
      return sendJson(response, 400, { error: "Request body is invalid" });
    }
    return sendJson(response, 500, { error: "Request could not be processed" });
  }
});

const roomSessionSchema = orderUpdateSchema.pick({ orderId: true, requestId: true }).extend({
  clientId: orderUpdateSchema.shape.accountId
});

async function readJson(request: import("node:http").IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response: import("node:http").ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

server.listen(port, () => {
  console.log(`Order room service listening on http://localhost:${port}`);
});
