import { describe, expect, test } from "bun:test";
import { deviceRegistryKey, lastPollKey, lastSuccessKey, stateKey } from "./keys";

describe("storage keys", () => {
  test("builds stable Valkey keys", () => {
    expect(deviceRegistryKey()).toBe("inels:devices");
    expect(stateKey("09354")).toBe("inels:state:09354");
    expect(lastPollKey()).toBe("inels:meta:last_poll");
    expect(lastSuccessKey()).toBe("inels:meta:last_success");
  });
});
