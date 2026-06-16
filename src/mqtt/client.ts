import mqtt, { type IClientOptions, type MqttClient } from "mqtt";
import type { Logger } from "pino";
import type { AppConfig } from "../config/env";
import { haBrightnessToRf003 } from "./state";
import { availabilityTopic, lightCommandTopic, switchCommandTopic } from "./topics";

export type MqttCommand =
  | { kind: "switch"; objectId: string; state: "ON" | "OFF" }
  | { kind: "light"; objectId: string; brightness: number };

export type EnqueueMqttCommand = (command: MqttCommand) => void | Promise<void>;

type ParsedCommandTopic = {
  kind: "switch" | "light";
  objectId: string;
};

const parseCommandTopic = (baseTopic: string, topic: string): ParsedCommandTopic | undefined => {
  const switchWildcardTopic = switchCommandTopic(baseTopic, "+");
  const baseTopicSuffix = "/switch/+/set";
  const normalizedBaseTopic = switchWildcardTopic.endsWith(baseTopicSuffix)
    ? switchWildcardTopic.slice(0, -baseTopicSuffix.length)
    : "";
  const prefix = normalizedBaseTopic === "" ? "" : `${normalizedBaseTopic}/`;
  if (prefix !== "" && !topic.startsWith(prefix)) {
    return undefined;
  }

  const [kind, objectId, suffix, ...extra] = topic.slice(prefix.length).split("/");
  if (
    extra.length > 0 ||
    (kind !== "switch" && kind !== "light") ||
    objectId === undefined ||
    objectId === "" ||
    suffix !== "set"
  ) {
    return undefined;
  }

  return { kind, objectId };
};

const parseLightCommandPayload = (payload: string): { brightness: number } | undefined => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return undefined;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return undefined;
  }

  const command = parsed as { state?: unknown; brightness?: unknown };
  if (command.state !== undefined && command.state !== "ON" && command.state !== "OFF") {
    return undefined;
  }

  if (command.state === "OFF") {
    return { brightness: 0 };
  }

  if (command.brightness !== undefined) {
    if (
      typeof command.brightness !== "number" ||
      !Number.isInteger(command.brightness) ||
      command.brightness < 0 ||
      command.brightness > 255
    ) {
      return undefined;
    }

    return { brightness: haBrightnessToRf003(command.brightness) };
  }

  if (command.state === "ON") {
    return { brightness: 100 };
  }

  return undefined;
};

export const createMqttClient = (
  config: AppConfig["mqtt"],
  logger: Logger,
  enqueueCommand?: EnqueueMqttCommand,
): MqttClient => {
  const mqttLogger = logger.child({ module: "mqtt" });
  const commandTopics = [switchCommandTopic(config.baseTopic, "+"), lightCommandTopic(config.baseTopic, "+")];

  const connectOptions: IClientOptions = {
    will: { topic: availabilityTopic(config.baseTopic), payload: "offline", retain: true, qos: 0 },
  };
  if (config.username !== undefined) {
    connectOptions.username = config.username;
  }
  if (config.password !== undefined) {
    connectOptions.password = config.password;
  }

  const client = mqtt.connect(config.url, connectOptions);

  client.on("connect", () => {
    mqttLogger.info({ url: config.url }, "mqtt connected");
    client.publish(availabilityTopic(config.baseTopic), "online", { retain: true });
    for (const commandTopic of commandTopics) {
      client.subscribe(commandTopic, (err) => {
        if (err) {
          mqttLogger.error({ err, topic: commandTopic }, "failed to subscribe to command topic");
        } else {
          mqttLogger.info({ topic: commandTopic }, "subscribed to command topic");
        }
      });
    }
  });

  client.on("message", (topic, payload) => {
    const rawPayload = payload.toString();
    mqttLogger.debug({ topic, payload: rawPayload }, "mqtt message received");

    const parsedTopic = parseCommandTopic(config.baseTopic, topic);
    if (parsedTopic === undefined) {
      mqttLogger.debug({ topic }, "mqtt command topic ignored");
      return;
    }

    if (enqueueCommand === undefined) {
      mqttLogger.warn({ topic }, "mqtt command received without command queue");
      return;
    }

    if (parsedTopic.kind === "switch") {
      const state = rawPayload.trim();
      if (state !== "ON" && state !== "OFF") {
        mqttLogger.warn({ topic, payload: rawPayload }, "invalid switch command payload");
        return;
      }

      void Promise.resolve(enqueueCommand({ kind: "switch", objectId: parsedTopic.objectId, state })).catch((err) => {
        mqttLogger.error({ err, topic }, "failed to enqueue mqtt switch command");
      });
      return;
    }

    const lightCommand = parseLightCommandPayload(rawPayload);
    if (lightCommand === undefined) {
      mqttLogger.warn({ topic, payload: rawPayload }, "invalid light command payload");
      return;
    }

    void Promise.resolve(
      enqueueCommand({ kind: "light", objectId: parsedTopic.objectId, brightness: lightCommand.brightness }),
    ).catch((err) => {
      mqttLogger.error({ err, topic }, "failed to enqueue mqtt light command");
    });
  });

  client.on("error", (err) => {
    mqttLogger.error({ err }, "mqtt error");
  });

  return client;
};
