import { Worker } from "bullmq";
import type { Logger } from "pino";
import type { ValkeyConnectionOptions } from "../storage/valkey";

const QUEUE_NAME = "gateway";
const CONCURRENCY = 1;

export const createGatewayWorker = (connection: ValkeyConnectionOptions, logger: Logger): Worker => {
  const workerLogger = logger.child({ module: "queue" });

  return new Worker(
    QUEUE_NAME,
    async (job) => {
      workerLogger.warn({ jobName: job.name }, "job handler not implemented");
      throw new Error("not implemented");
    },
    { connection, concurrency: CONCURRENCY },
  );
};
