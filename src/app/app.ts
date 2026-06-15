import type { Logger } from "pino";
import type { AppConfig } from "../config/env";
import { createHttpServer } from "../http/server";

export type App = {
  start: () => void;
};

export const createApp = (config: AppConfig, logger: Logger): App => ({
  start: () => {
    const httpLogger = logger.child({ module: "http" });
    const server = createHttpServer();

    server.listen({
      hostname: config.http.host,
      port: config.http.port,
    });

    httpLogger.info({ host: config.http.host, port: config.http.port }, "http server started");
  },
});
