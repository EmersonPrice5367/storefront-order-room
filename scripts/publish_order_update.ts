export {};

const orderId = "ord_2048";
const accountId = "shop_17";
const requestId = "8fdaf44c-e21f-42cb-9ee7-4d61d6ffbe99";

await postJson("http://localhost:3000/room-sessions", {
  orderId,
  clientId: accountId,
  requestId
});

const result = await postJson("http://localhost:3000/order-updates", {
  orderId,
  accountId,
  from: "paid",
  to: "fulfilling",
  message: "Your order is being packed.",
  requestId
});

console.log(result);

async function postJson(url: string, body: object) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  let result: unknown;
  try {
    result = JSON.parse(text);
  } catch {
    result = text;
  }

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}): ${text}`);
  }

  return result;
}
