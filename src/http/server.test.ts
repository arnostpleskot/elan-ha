import { describe, expect, test } from "bun:test";
import { createHttpServer } from "./server";

describe("createHttpServer", () => {
  test("GET /healthz returns ok", async () => {
    const app = createHttpServer();
    const response = await app.handle(new Request("http://localhost/healthz"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
