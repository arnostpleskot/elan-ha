import pino, { type Logger } from "pino";
import type { AppConfig } from "../config/env";

export const loggerRedactPaths = [
  "rf003.password",
  "mqtt.password",
  "password",
  "key",
  "cookie",
  "authorization",
  "*.password",
  "*.key",
  "*.cookie",
  "*.authorization",
  "*.headers.cookie",
  "*.headers.authorization",
  "*.headers.set-cookie",
  "*.body.password",
  "*.body.key",
  "req.headers.cookie",
  "req.headers.authorization",
  "res.headers.set-cookie",
];

const baseOptions = (config: Pick<AppConfig, "logLevel">) => ({
  level: config.logLevel,
  redact: {
    paths: loggerRedactPaths,
    censor: "[Redacted]",
  },
});

export const createLogger = (config: Pick<AppConfig, "logLevel">): Logger => {
  const isDevelopment = Bun.env.NODE_ENV === "development";

  if (isDevelopment) {
    return pino({
      ...baseOptions(config),
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss",
          ignore: "pid,hostname",
        },
      },
    });
  }

  return pino(baseOptions(config));
};
