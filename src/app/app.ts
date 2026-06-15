import type { Logger } from "pino";
import type { AppConfig } from "../config/env";
import { createMqttClient } from "../mqtt/client";
import { checkReadiness } from "../observability/readiness";
import { createGatewayQueue } from "../queue/scheduler";
import { createGatewayWorker } from "../queue/worker";
import { createValkeyClient, parseValkeyConnectionOptions } from "../storage/valkey";
import { createHttpServer } from "../http/server";

export type App = {
  start: () => void;
};

export const createApp = (config: AppConfig, logger: Logger): App => ({
  start: () => {
    const valkey = createValkeyClient(config.valkey.url);
    const connection = parseValkeyConnectionOptions(config.valkey.url);
    const mqttClient = createMqttClient(config.mqtt, logger);
    createGatewayQueue(connection);
    createGatewayWorker(connection, logger);

    const httpLogger = logger.child({ module: "http" });
    const server = createHttpServer({
      getReadiness: () => checkReadiness(mqttClient, valkey),
    });

    server.listen({
      hostname: config.http.host,
      port: config.http.port,
    });

    httpLogger.info({ host: config.http.host, port: config.http.port }, "http server started");
  },
});
