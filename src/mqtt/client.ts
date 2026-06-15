import mqtt, { type IClientOptions, type MqttClient } from "mqtt";
import type { Logger } from "pino";
import type { AppConfig } from "../config/env";

export const createMqttClient = (config: AppConfig["mqtt"], logger: Logger): MqttClient => {
  const mqttLogger = logger.child({ module: "mqtt" });
  const commandTopic = `${config.baseTopic}/switch/+/set`;

  const connectOptions: IClientOptions = {};
  if (config.username !== undefined) {
    connectOptions.username = config.username;
  }
  if (config.password !== undefined) {
    connectOptions.password = config.password;
  }

  const client = mqtt.connect(config.url, connectOptions);

  client.on("connect", () => {
    mqttLogger.info({ url: config.url }, "mqtt connected");
    client.subscribe(commandTopic, (err) => {
      if (err) {
        mqttLogger.error({ err, topic: commandTopic }, "failed to subscribe to command topic");
      } else {
        mqttLogger.info({ topic: commandTopic }, "subscribed to command topic");
      }
    });
  });

  client.on("message", (topic, payload) => {
    mqttLogger.debug({ topic, payload: payload.toString() }, "mqtt message received");
  });

  client.on("error", (err) => {
    mqttLogger.error({ err }, "mqtt error");
  });

  return client;
};
