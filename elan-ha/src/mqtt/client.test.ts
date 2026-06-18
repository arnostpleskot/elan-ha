import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Logger } from "pino";
import type { AppConfig } from "../config/env";

type MqttHandler = (...args: unknown[]) => void;

const handlers = new Map<string, MqttHandler>();
const subscriptions: string[] = [];
const publishes: unknown[][] = [];

const mqttConnect = mock((_url: string, _options: unknown) => ({
  on: (event: string, handler: MqttHandler) => {
    handlers.set(event, handler);
  },
  subscribe: (topic: string, callback?: (err?: Error) => void) => {
    subscriptions.push(topic);
    callback?.();
  },
  publish: (topic: string, payload: string | Buffer, ...args: unknown[]) => {
    publishes.push([topic, payload, ...args]);
  },
}));

mock.module("mqtt", () => ({
  default: { connect: mqttConnect },
}));

const { createMqttClient } = await import("./client");

const config: AppConfig["mqtt"] = {
  url: "mqtt://localhost",
  baseTopic: "inels",
  discoveryPrefix: "homeassistant",
};

const makeLogger = () => {
  const calls: Array<{ level: "info" | "warn" | "error" | "debug"; obj: unknown; msg?: string }> = [];
  const push = (level: "info" | "warn" | "error" | "debug", obj: unknown, msg?: string) => {
    calls.push(msg === undefined ? { level, obj } : { level, obj, msg });
  };

  return {
    calls,
    logger: {
      child: () => ({
        info: (obj: unknown, msg?: string) => push("info", obj, msg),
        warn: (obj: unknown, msg?: string) => push("warn", obj, msg),
        error: (obj: unknown, msg?: string) => push("error", obj, msg),
        debug: (obj: unknown, msg?: string) => push("debug", obj, msg),
      }),
    } as unknown as Logger,
  };
};

const logger = makeLogger().logger;

beforeEach(() => {
  handlers.clear();
  subscriptions.length = 0;
  publishes.length = 0;
  mqttConnect.mockClear();
});

describe("createMqttClient", () => {
  test("subscribes to switch, light, and fan command topics on connect", () => {
    createMqttClient(config, logger);

    handlers.get("connect")?.();

    expect(subscriptions).toEqual(["inels/switch/+/set", "inels/light/+/set", "inels/fan/+/set"]);
  });

  test("publishes retained online availability on connect", () => {
    createMqttClient(config, logger);

    handlers.get("connect")?.();

    expect(publishes).toContainEqual(["inels/status", "online", { retain: true }]);
  });

  test("logs outbound MQTT publishes at debug", () => {
    const { logger, calls } = makeLogger();
    const client = createMqttClient(config, logger);

    client.publish("inels/test", "payload", { retain: true });

    expect(calls).toContainEqual({
      level: "debug",
      obj: { topic: "inels/test", payload: "payload", retain: true },
      msg: "mqtt message published",
    });
  });

  test("forwards callback-only MQTT publish overload", () => {
    const client = createMqttClient(config, logger);
    const callback = mock(() => {});

    client.publish("inels/test", "payload", callback);

    expect(publishes).toEqual([["inels/test", "payload", callback]]);
  });

  test("forwards options and callback MQTT publish overload", () => {
    const client = createMqttClient(config, logger);
    const callback = mock(() => {});

    client.publish("inels/test", "payload", { retain: true }, callback);

    expect(publishes).toEqual([["inels/test", "payload", { retain: true }, callback]]);
  });

  test("redacts secret keys in logged JSON MQTT payloads", () => {
    const { logger, calls } = makeLogger();
    const client = createMqttClient(config, logger);
    const payload = JSON.stringify({
      username: "user",
      password: "secret",
      nested: [{ Authorization: "bearer token", value: "visible" }],
    });

    client.publish("inels/test", payload, { retain: false });

    expect(calls).toContainEqual({
      level: "debug",
      obj: {
        topic: "inels/test",
        payload: {
          username: "user",
          password: "[Redacted]",
          nested: [{ Authorization: "[Redacted]", value: "visible" }],
        },
        retain: false,
      },
      msg: "mqtt message published",
    });
    expect(publishes).toContainEqual(["inels/test", payload, { retain: false }]);
  });

  test("logs Buffer MQTT payloads as strings without altering published payload", () => {
    const { logger, calls } = makeLogger();
    const client = createMqttClient(config, logger);
    const payload = Buffer.from("buffer payload");

    client.publish("inels/test", payload);

    expect(calls).toContainEqual({
      level: "debug",
      obj: { topic: "inels/test", payload: "buffer payload", retain: false },
      msg: "mqtt message published",
    });
    expect(publishes).toContainEqual(["inels/test", payload]);
  });

  test("configures a retained offline Last Will on the normalized availability topic", () => {
    createMqttClient({ ...config, baseTopic: "/inels/" }, logger);

    expect(mqttConnect).toHaveBeenCalledWith("mqtt://localhost", {
      will: { topic: "inels/status", payload: "offline", retain: true, qos: 0 },
    });
  });

  test("normalizes base topic boundaries for subscriptions and dispatch", () => {
    const commands: unknown[] = [];
    createMqttClient({ ...config, baseTopic: "/inels/" }, logger, async (command) => {
      commands.push(command);
    });

    handlers.get("connect")?.();
    handlers.get("message")?.("inels/switch/inels_09354/set", Buffer.from("ON"));

    expect(subscriptions).toEqual(["inels/switch/+/set", "inels/light/+/set", "inels/fan/+/set"]);
    expect(commands).toEqual([{ kind: "switch", objectId: "inels_09354", state: "ON" }]);
  });

  test("dispatches switch command from command topic", () => {
    const commands: unknown[] = [];
    createMqttClient(config, logger, async (command) => {
      commands.push(command);
    });

    handlers.get("message")?.("inels/switch/inels_09354/set", Buffer.from("ON"));

    expect(commands).toEqual([{ kind: "switch", objectId: "inels_09354", state: "ON" }]);
  });

  test("dispatches fan command from command topic", () => {
    const commands: unknown[] = [];
    createMqttClient(config, logger, async (command) => {
      commands.push(command);
    });

    handlers.get("message")?.("inels/fan/inels_09355/set", Buffer.from("OFF"));

    expect(commands).toEqual([{ kind: "fan", objectId: "inels_09355", state: "OFF" }]);
  });

  test("dispatches light brightness command with RF-003 native brightness", () => {
    const commands: unknown[] = [];
    createMqttClient(config, logger, async (command) => {
      commands.push(command);
    });

    handlers.get("message")?.("inels/light/inels_47742/set", Buffer.from(JSON.stringify({ brightness: 50 })));

    expect(commands).toEqual([{ kind: "light", objectId: "inels_47742", brightness: 50 }]);
  });

  test("dispatches light ON/OFF command from string payload", () => {
    const commands: unknown[] = [];
    createMqttClient(config, logger, async (command) => {
      commands.push(command);
    });

    handlers.get("message")?.("inels/light/inels_09356/set", Buffer.from("ON"));
    handlers.get("message")?.("inels/light/inels_09356/set", Buffer.from("OFF"));

    expect(commands).toEqual([
      { kind: "light", objectId: "inels_09356", state: "ON" },
      { kind: "light", objectId: "inels_09356", state: "OFF" },
    ]);
  });

  test("dispatches light OFF state-only command as zero RF-003 brightness", () => {
    const commands: unknown[] = [];
    createMqttClient(config, logger, async (command) => {
      commands.push(command);
    });

    handlers.get("message")?.("inels/light/inels_47742/set", Buffer.from(JSON.stringify({ state: "OFF" })));

    expect(commands).toEqual([{ kind: "light", objectId: "inels_47742", brightness: 0 }]);
  });

  test("dispatches light ON state-only command as full RF-003 brightness", () => {
    const commands: unknown[] = [];
    createMqttClient(config, logger, async (command) => {
      commands.push(command);
    });

    handlers.get("message")?.("inels/light/inels_47742/set", Buffer.from(JSON.stringify({ state: "ON" })));

    expect(commands).toEqual([{ kind: "light", objectId: "inels_47742", brightness: 100 }]);
  });

  test("dispatches light OFF command with brightness as zero RF-003 brightness", () => {
    const commands: unknown[] = [];
    createMqttClient(config, logger, async (command) => {
      commands.push(command);
    });

    handlers
      .get("message")
      ?.("inels/light/inels_47742/set", Buffer.from(JSON.stringify({ state: "OFF", brightness: 128 })));

    expect(commands).toEqual([{ kind: "light", objectId: "inels_47742", brightness: 0 }]);
  });

  test("does not dispatch invalid switch payload", () => {
    const commands: unknown[] = [];
    createMqttClient(config, logger, async (command) => {
      commands.push(command);
    });

    handlers.get("message")?.("inels/switch/inels_09354/set", Buffer.from("on"));

    expect(commands).toEqual([]);
  });

  test("does not dispatch invalid light JSON", () => {
    const commands: unknown[] = [];
    createMqttClient(config, logger, async (command) => {
      commands.push(command);
    });

    handlers.get("message")?.("inels/light/inels_47742/set", Buffer.from("{"));

    expect(commands).toEqual([]);
  });

  test("does not dispatch out-of-range light brightness", () => {
    const commands: unknown[] = [];
    createMqttClient(config, logger, async (command) => {
      commands.push(command);
    });

    handlers.get("message")?.("inels/light/inels_47742/set", Buffer.from(JSON.stringify({ brightness: 101 })));

    expect(commands).toEqual([]);
  });

  test("does not dispatch fractional light brightness", () => {
    const commands: unknown[] = [];
    createMqttClient(config, logger, async (command) => {
      commands.push(command);
    });

    handlers.get("message")?.("inels/light/inels_47742/set", Buffer.from(JSON.stringify({ brightness: 127.5 })));

    expect(commands).toEqual([]);
  });

  test("does not dispatch topic outside base topic", () => {
    const commands: unknown[] = [];
    createMqttClient(config, logger, async (command) => {
      commands.push(command);
    });

    handlers.get("message")?.("other/switch/inels_09354/set", Buffer.from("ON"));

    expect(commands).toEqual([]);
  });
});
