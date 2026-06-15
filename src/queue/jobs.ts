export const GatewayJobName = {
  SetOutput: "command.set_output",
  PollFullState: "poll.full_state",
  PollDeviceState: "poll.device_state",
  PublishDiscovery: "discovery.publish",
} as const;

export type GatewayJobName = (typeof GatewayJobName)[keyof typeof GatewayJobName];

export const JobPriority = {
  Command: 1,
  Poll: 10,
  Discovery: 20,
} as const;

export type SetOutputJob = {
  name: typeof GatewayJobName.SetOutput;
  data: {
    deviceId: string;
    channel: number;
    state: "ON" | "OFF";
  };
};

export type PollFullStateJob = {
  name: typeof GatewayJobName.PollFullState;
  data: Record<string, never>;
};

export type PollDeviceStateJob = {
  name: typeof GatewayJobName.PollDeviceState;
  data: {
    deviceId: string;
  };
};

export type PublishDiscoveryJob = {
  name: typeof GatewayJobName.PublishDiscovery;
  data: Record<string, never>;
};

export type GatewayJob = SetOutputJob | PollFullStateJob | PollDeviceStateJob | PublishDiscoveryJob;
