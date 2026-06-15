import pino, { type Logger } from "pino";
import type { AppConfig } from "../config/env";

export const createLogger = (config: Pick<AppConfig, "logLevel">): Logger => {
  const isDevelopment = Bun.env.NODE_ENV === "development";

  if (isDevelopment) {
    return pino({
      level: config.logLevel,
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

  return pino({
    level: config.logLevel,
  });
};
