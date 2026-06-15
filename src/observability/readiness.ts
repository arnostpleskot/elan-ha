import type { Redis } from "ioredis";
import type { MqttClient } from "mqtt";

export type ReadinessResult = {
  ready: boolean;
  mqtt: boolean;
  valkey: boolean;
};

export const checkReadiness = async (mqtt: MqttClient, valkey: Redis): Promise<ReadinessResult> => {
  const mqttReady = mqtt.connected;

  let valkeyReady = false;
  try {
    await valkey.ping();
    valkeyReady = true;
  } catch {
    valkeyReady = false;
  }

  return {
    ready: mqttReady && valkeyReady,
    mqtt: mqttReady,
    valkey: valkeyReady,
  };
};
