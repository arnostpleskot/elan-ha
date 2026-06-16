import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Logger } from "pino";
import type { AppConfig } from "../config/env";

type MqttHandler = (...args: unknown[]) => void;

const handlers = new Map<string, MqttHandler>();
const subscriptions: string[] = [];
const publishes: Array<[string, string, { retain?: boolean }?]> = [];

const mqttConnect = mock((_url: string, _options: unknown) => ({
  on: (event: string, handler: MqttHandler) => {
    handlers.set(event, handler);
  },
  subscribe: (topic: string, callback?: (err?: Error) => void) => {
    subscriptions.push(topic);
    callback?.();
  },
  publish: (topic: string, payload: string, opts?: { retain?: boolean }) => {
    publishes.push(opts === undefined ? [topic, payload] : [topic, payload, opts]);
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

const logger = {
  child: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
} as unknown as Logger;

beforeEach(() => {
  handlers.clear();
  subscriptions.length = 0;
  publishes.length = 0;
  mqttConnect.mockClear();
});

describe("createMqttClient", () => {
  test("subscribes to switch and light command topics on connect", () => {
    createMqttClient(config, logger);

    handlers.get("connect")?.();

    expect(subscriptions).toEqual(["inels/switch/+/set", "inels/light/+/set"]);
  });

  test("publishes retained online availability on connect", () => {
    createMqttClient(config, logger);

    handlers.get("connect")?.();

    expect(publishes).toContainEqual(["inels/status", "online", { retain: true }]);
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

    expect(subscriptions).toEqual(["inels/switch/+/set", "inels/light/+/set"]);
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

  test("dispatches light brightness command with RF-003 brightness", () => {
    const commands: unknown[] = [];
    createMqttClient(config, logger, async (command) => {
      commands.push(command);
    });

    handlers.get("message")?.("inels/light/inels_47742/set", Buffer.from(JSON.stringify({ brightness: 128 })));

    expect(commands).toEqual([{ kind: "light", objectId: "inels_47742", brightness: 50 }]);
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

    handlers.get("message")?.("inels/light/inels_47742/set", Buffer.from(JSON.stringify({ brightness: 256 })));

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
