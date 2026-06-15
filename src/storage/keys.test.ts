import { describe, expect, test } from "bun:test";
import { deviceRegistryKey, lastPollKey, lastSuccessKey, stateKey } from "./keys";

describe("storage keys", () => {
  test("builds stable Valkey keys", () => {
    expect(deviceRegistryKey()).toBe("inels:devices");
    expect(stateKey("rfsa66m_1", 2)).toBe("inels:state:rfsa66m_1:2");
    expect(lastPollKey()).toBe("inels:meta:last_poll");
    expect(lastSuccessKey()).toBe("inels:meta:last_success");
  });
});
