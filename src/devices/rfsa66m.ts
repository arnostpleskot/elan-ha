import type { Rfsa66mDevice, SwitchChannel } from "./types";

const RFSA66M_CHANNEL_COUNT = 6;

export const rfsa66mObjectId = (deviceIndex: number, channel: number): string =>
  `inels_rfsa66m_${deviceIndex}_ch${channel}`;

type CreateChannelsInput = {
  deviceIndex: number;
  deviceId: string;
  name: string;
};

export const createRfsa66mChannels = ({ deviceIndex, deviceId, name }: CreateChannelsInput): SwitchChannel[] =>
  Array.from({ length: RFSA66M_CHANNEL_COUNT }, (_, index) => {
    const channel = index + 1;

    return {
      deviceId,
      deviceIndex,
      channel,
      name: `${name} Channel ${channel}`,
      objectId: rfsa66mObjectId(deviceIndex, channel),
    };
  });

export const createRfsa66mDevices = (count: number): Rfsa66mDevice[] =>
  Array.from({ length: count }, (_, index) => {
    const deviceIndex = index + 1;
    const id = `rfsa66m_${deviceIndex}`;
    const name = `RFSA-66M ${deviceIndex}`;

    return {
      id,
      index: deviceIndex,
      name,
      channels: createRfsa66mChannels({ deviceIndex, deviceId: id, name }),
    };
  });
