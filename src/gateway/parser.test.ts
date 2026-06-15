import { describe, expect, test } from "bun:test";
import { parseGatewayResponse } from "./parser";

const makeResponse = (body: string, contentType?: string): Response => {
  const headers = new Headers();
  if (contentType !== undefined) {
    headers.set("content-type", contentType);
  }
  return new Response(body, { headers });
};

describe("parseGatewayResponse", () => {
  test("parses JSON when content-type is application/json", async () => {
    const response = makeResponse(JSON.stringify({ ok: true, count: 3 }), "application/json");
    const result = await parseGatewayResponse(response);
    expect(result).toEqual({ ok: true, count: 3 });
  });

  test("parses JSON when content-type includes charset", async () => {
    const response = makeResponse(JSON.stringify({ ok: true }), "application/json; charset=utf-8");
    const result = await parseGatewayResponse(response);
    expect(result).toEqual({ ok: true });
  });

  test("returns text when content-type is not JSON", async () => {
    const response = makeResponse("plain body", "text/plain");
    const result = await parseGatewayResponse(response);
    expect(result).toBe("plain body");
  });

  test("returns text when content-type is missing", async () => {
    const response = makeResponse("no content type body");
    const result = await parseGatewayResponse(response);
    expect(result).toBe("no content type body");
  });
});
