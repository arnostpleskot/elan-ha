import { describe, expect, test } from "bun:test";
import type { GatewayClient } from "./types";
import { createGatewayOperations } from "./operations";

describe("gateway operations", () => {
  test("lists device IDs from the RF-003 device map", async () => {
    const client = { call: async () => ({ "09354": { url: "x" }, "00472": { url: "y" } }) } as GatewayClient;
    await expect(createGatewayOperations(client).listDeviceIds()).resolves.toEqual(["09354", "00472"]);
  });

  test("rejects invalid devices responses", async () => {
    const client = { call: async () => [] } as GatewayClient;
    await expect(createGatewayOperations(client).listDeviceIds()).rejects.toThrow("Invalid devices response");
  });

  test("rejects invalid device detail responses", async () => {
    const client = { call: async () => null } as GatewayClient;
    await expect(createGatewayOperations(client).getDeviceDetail("09354")).rejects.toThrow("Invalid device detail response");
  });

  test("rejects invalid device state responses", async () => {
    const client = { call: async () => [] } as GatewayClient;
    await expect(createGatewayOperations(client).getDeviceState("09354")).rejects.toThrow("Invalid device state response");
  });

  test("writes switch and brightness commands", async () => {
    const calls: unknown[] = [];
    const client = { call: async (...args: unknown[]) => calls.push(args) } as GatewayClient;
    const ops = createGatewayOperations(client);

    await ops.setSwitch("09354", true);
    await ops.setBrightness("47742", 50);

    expect(calls).toEqual([
      ["devices/09354", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ on: true }) }],
      ["devices/47742", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ brightness: 50 }) }],
    ]);
  });
});
