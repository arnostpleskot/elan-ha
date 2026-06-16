import { describe, expect, test } from "bun:test";
import { GatewayJobName, JobPriority } from "./jobs";
import type { SetOutputJob } from "./jobs";

describe("queue jobs", () => {
  test("defines stable job names", () => {
    expect(GatewayJobName.SetOutput).toBe("command.set_output");
    expect(GatewayJobName.SetBrightness).toBe("command.set_brightness");
    expect(GatewayJobName.PollFullState).toBe("poll.full_state");
    expect(GatewayJobName.PollDeviceState).toBe("poll.device_state");
    expect(GatewayJobName.PublishDiscovery).toBe("discovery.publish");
    expect(GatewayJobName.ForceDiscovery).toBe("discovery.force");
  });

  test("defines set-output payloads without channels", () => {
    const job = {
      name: GatewayJobName.SetOutput,
      data: { deviceId: "09354", state: "ON" },
    } satisfies SetOutputJob;

    expect(job.data).toEqual({ deviceId: "09354", state: "ON" });
  });

  test("prioritizes commands before polling and discovery", () => {
    expect(JobPriority.Command).toBeLessThan(JobPriority.Poll);
    expect(JobPriority.Poll).toBeLessThan(JobPriority.Discovery);
  });
});
