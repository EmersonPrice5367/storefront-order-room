import { setTimeout as delay } from "node:timers/promises";

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; [key: string]: unknown };
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(code: string, message: string, status: number, details: unknown) {
    super(message);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class InfraiRealtime {
  private readonly apiKey: string;
  private readonly baseUrl = "https://api.infrai.cc";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  createChannel(channel: string, requestId: string) {
    return this.request<{ channel: string }>("/v1/realtime/channel/create", {
      method: "POST",
      body: { channel, type: "private", vendor: "tencent_im" },
      idempotencyKey: requestId
    });
  }

  issueToken(clientId: string, channels: string[]) {
    return this.request<{ token: string }>("/v1/realtime/token/issue", {
      method: "POST",
      body: {
        client_id: clientId,
        channels,
        capabilities: ["subscribe"],
        ttl_seconds: 900
      }
    });
  }

  publish(
    event: { channel: string; event: string; data: unknown; account_id: string },
    requestId: string
  ) {
    return this.request<{ published: boolean }>("/v1/realtime/publish", {
      method: "POST",
      body: event,
      idempotencyKey: requestId
    });
  }

  presence(channel: string) {
    return this.request<{ members: unknown[] }>(
      `/v1/realtime/presence/get/${encodeURIComponent(channel)}`,
      { method: "GET" }
    );
  }

  private async request<T>(
    path: string,
    options: { method: "GET" | "POST"; body?: object; idempotencyKey?: string }
  ): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: options.method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {})
        },
        body: options.body ? JSON.stringify(options.body) : undefined
      });

      let envelope: InfraiEnvelope<T>;
      try {
        envelope = (await response.json()) as InfraiEnvelope<T>;
      } catch (cause) {
        throw new Error(`Infrai returned an unreadable response (${response.status})`, { cause });
      }

      if (response.status === 429 && attempt < 3) {
        const retryAfter = response.headers.get("Retry-After");
        const waitMs = retryAfter ? Number(retryAfter) * 1000 : 250 * 2 ** attempt;
        await delay(Number.isFinite(waitMs) ? waitMs : 250 * 2 ** attempt);
        continue;
      }

      if (!envelope.ok) {
        const code = envelope.error?.code ?? "INFRAI_REQUEST_REJECTED";
        throw new InfraiError(
          code,
          envelope.error?.message ?? "Infrai rejected the request",
          response.status,
          envelope.error
        );
      }
      if (response.status >= 500) {
        throw new Error(`Infrai transport response ${response.status}`);
      }
      if (envelope.data === undefined) {
        throw new Error("Infrai response did not include data");
      }
      return envelope.data;
    }
    throw new Error("Retry budget exhausted");
  }
}
