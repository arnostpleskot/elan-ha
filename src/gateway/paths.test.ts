import { describe, expect, test } from "bun:test";
import { gatewayPaths } from "./paths";

describe("gatewayPaths", () => {
  test("devices is the collection path", () => {
    expect(gatewayPaths.devices).toBe("devices");
  });

  test("device(id) interpolates id", () => {
    expect(gatewayPaths.device("rfsa66m_1")).toBe("devices/rfsa66m_1");
  });

  test("deviceState(id) appends /state", () => {
    expect(gatewayPaths.deviceState("rfsa66m_1")).toBe(
      "devices/rfsa66m_1/state"
    );
  });
});
