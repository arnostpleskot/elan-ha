const PREFIX = "inels";

export const deviceRegistryKey = (): string => `${PREFIX}:devices`;

export const stateKey = (deviceId: string): string => `${PREFIX}:state:${deviceId}`;

export const lastPollKey = (): string => `${PREFIX}:meta:last_poll`;

export const lastSuccessKey = (): string => `${PREFIX}:meta:last_success`;
