export type AppConfig = {
  rf003: {
    baseUrl: string;
    username: string;
    password: string;
  };
  mqtt: {
    url: string;
    username?: string;
    password?: string;
    discoveryPrefix: string;
    baseTopic: string;
  };
  valkey: {
    url: string;
  };
  poll: {
    fullStateIntervalMs: number;
    deviceStateIntervalMs: number;
  };
  http: {
    host: string;
    port: number;
  };
  logLevel: "debug" | "info" | "warn" | "error";
};

type EnvInput = Record<string, string | undefined>;

const requireEnv = (env: EnvInput, name: string): string => {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
};

const requireUrlWithProtocol = (env: EnvInput, name: string, allowedProtocols: string[]): string => {
  const value = requireEnv(env, name);

  try {
    const url = new URL(value);
    if (allowedProtocols.includes(url.protocol)) {
      return value;
    }
  } catch {
    // Fall through to the common validation error below.
  }

  throw new Error(`${name} must be a valid URL with protocol ${allowedProtocols.join(" or ")}`);
};

const parseInteger = (env: EnvInput, name: string, defaultValue: number): number => {
  const rawValue = env[name];
  if (!rawValue) {
    return defaultValue;
  }

  if (!/^-?\d+$/.test(rawValue)) {
    throw new Error(`${name} must be a valid integer`);
  }

  const value = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(value)) {
    throw new Error(`${name} must be a valid integer`);
  }
  return value;
};

const parsePositiveInteger = (env: EnvInput, name: string, defaultValue: number): number => {
  const value = parseInteger(env, name, defaultValue);
  if (value <= 0) {
    throw new Error(`${name} must be greater than 0`);
  }
  return value;
};

const parseHttpPort = (env: EnvInput, name: string, defaultValue: number): number => {
  const value = parseInteger(env, name, defaultValue);
  if (value < 1 || value > 65_535) {
    throw new Error(`${name} must be between 1 and 65535`);
  }
  return value;
};

const parseLogLevel = (value: string | undefined): AppConfig["logLevel"] => {
  if (!value) {
    return "info";
  }

  if (value === "debug" || value === "info" || value === "warn" || value === "error") {
    return value;
  }

  throw new Error("LOG_LEVEL must be one of debug, info, warn, error");
};

export const parseEnv = (env: EnvInput): AppConfig => {
  const rf003: AppConfig["rf003"] = {
    baseUrl: requireUrlWithProtocol(env, "RF003_BASE_URL", ["http:", "https:"]),
    username: requireEnv(env, "RF003_USERNAME"),
    password: requireEnv(env, "RF003_PASSWORD"),
  };

  const mqtt: AppConfig["mqtt"] = {
    url: requireUrlWithProtocol(env, "MQTT_URL", ["mqtt:", "mqtts:"]),
    discoveryPrefix: env.MQTT_DISCOVERY_PREFIX ?? "homeassistant",
    baseTopic: env.MQTT_BASE_TOPIC ?? "inels",
  };

  if (env.MQTT_USERNAME) {
    mqtt.username = env.MQTT_USERNAME;
  }

  if (env.MQTT_PASSWORD) {
    mqtt.password = env.MQTT_PASSWORD;
  }

  return {
    rf003,
    mqtt,
    valkey: {
      url: requireUrlWithProtocol(env, "VALKEY_URL", ["redis:", "rediss:"]),
    },
    poll: {
      fullStateIntervalMs: parsePositiveInteger(env, "POLL_FULL_STATE_INTERVAL_MS", 60_000),
      deviceStateIntervalMs: parsePositiveInteger(env, "POLL_DEVICE_STATE_INTERVAL_MS", 300_000),
    },
    http: {
      host: env.HTTP_HOST ?? "0.0.0.0",
      port: parseHttpPort(env, "HTTP_PORT", 3000),
    },
    logLevel: parseLogLevel(env.LOG_LEVEL),
  };
};

export const loadConfig = (): AppConfig => parseEnv(Bun.env);
