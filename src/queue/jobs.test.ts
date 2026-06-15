import { describe, expect, test } from "bun:test";
import { GatewayJobName, JobPriority } from "./jobs";

describe("queue jobs", () => {
  test("defines stable job names", () => {
    expect(GatewayJobName.SetOutput).toBe("command.set_output");
    expect(GatewayJobName.PollFullState).toBe("poll.full_state");
    expect(GatewayJobName.PollDeviceState).toBe("poll.device_state");
    expect(GatewayJobName.PublishDiscovery).toBe("discovery.publish");
  });

  test("prioritizes commands before polling and discovery", () => {
    expect(JobPriority.Command).toBeLessThan(JobPriority.Poll);
    expect(JobPriority.Poll).toBeLessThan(JobPriority.Discovery);
  });
});
