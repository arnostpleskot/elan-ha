import type { Redis } from "ioredis";
import type { MqttClient } from "mqtt";

export type ReadinessResult = {
  ready: boolean;
  mqtt: boolean;
  valkey: boolean;
  rf003: boolean;
};

export const checkReadiness = async (
  mqtt: MqttClient,
  valkey: Redis,
  checkRf003: () => Promise<boolean>,
): Promise<ReadinessResult> => {
  const mqttReady = mqtt.connected;

  let valkeyReady = false;
  try {
    await valkey.ping();
    valkeyReady = true;
  } catch {
    valkeyReady = false;
  }

  let rf003Ready = false;
  try {
    rf003Ready = await checkRf003();
  } catch {
    rf003Ready = false;
  }

  return {
    ready: mqttReady && valkeyReady && rf003Ready,
    mqtt: mqttReady,
    valkey: valkeyReady,
    rf003: rf003Ready,
  };
};
