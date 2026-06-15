export type SwitchChannel = {
  deviceId: string;
  deviceIndex: number;
  channel: number;
  name: string;
  objectId: string;
};

export type Rfsa66mDevice = {
  id: string;
  index: number;
  name: string;
  channels: SwitchChannel[];
};
