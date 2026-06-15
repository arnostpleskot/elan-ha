import { createApp } from "./app/app";
import { loadConfig } from "./config/env";
import { createLogger } from "./observability/logger";

const config = loadConfig();
const logger = createLogger(config);

createApp(config, logger).start();
