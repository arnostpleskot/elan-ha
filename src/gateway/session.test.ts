import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { Logger } from "pino";
import type { AppConfig } from "../config/env";
import { GatewayError } from "./types";

type CapturedRequest = {
  url: string;
  init?: RequestInit;
};

let captured: CapturedRequest | null = null;
let fetchResponse: Response;
const originalFetch = globalThis.fetch;

const sha1Hex = (input: string): string =>
  new Bun.CryptoHasher("sha1").update(input).digest("hex");

beforeEach(() => {
  captured = null;
  fetchResponse = new Response(null, { status: 200 });
  globalThis.fetch = mock(async (url: string, init?: RequestInit) => {
    captured = init !== undefined ? { url, init } : { url };
    return fetchResponse;
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const { createGatewaySession } = await import("./session");

const fakeLogger = {
  child: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  }),
} as unknown as Logger;

const config: AppConfig["rf003"] = {
  baseUrl: "http://10.0.0.5",
  username: "admin",
  password: "secret",
};

describe("createGatewaySession", () => {
  test("authenticate posts form body to /login", async () => {
    const session = createGatewaySession(config, fakeLogger);
    await session.authenticate();

    expect(captured?.url).toBe("http://10.0.0.5/login");
    expect(captured?.init?.method).toBe("POST");

    const body = captured?.init?.body as URLSearchParams;
    expect(body.get("name")).toBe("admin");
    expect(body.get("key")).toBe(sha1Hex("secret"));
  });

  test("authenticate throws GatewayError on non-2xx", async () => {
    fetchResponse = new Response(null, { status: 403 });
    const session = createGatewaySession(config, fakeLogger);

    let thrown: unknown = null;
    try {
      await session.authenticate();
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(GatewayError);
    expect((thrown as GatewayError).kind).toBe("unauthorized");
  });

  test("session.fetch delegates to wrapped fetch", async () => {
    const session = createGatewaySession(config, fakeLogger);
    await session.fetch("http://10.0.0.5/api/devices");

    expect(captured?.url).toBe("http://10.0.0.5/api/devices");
  });
});
