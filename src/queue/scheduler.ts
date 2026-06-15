import { Queue } from "bullmq";
import type { ValkeyConnectionOptions } from "../storage/valkey";

const QUEUE_NAME = "gateway";

export const createGatewayQueue = (connection: ValkeyConnectionOptions): Queue =>
  new Queue(QUEUE_NAME, { connection });
