import { loadConfig } from "../src/config/env";
import { createGatewayClient } from "../src/gateway/client";
import { gatewayPaths } from "../src/gateway/paths";
import { createGatewaySession } from "../src/gateway/session";
import { GatewayError } from "../src/gateway/types";
import { createLogger } from "../src/observability/logger";

const main = async (): Promise<void> => {
  const config = loadConfig();
  const logger = createLogger(config);
  const probeLogger = logger.child({ module: "probe" });

  const deviceIds = Bun.argv.slice(2);

  probeLogger.info({ baseUrl: config.rf003.baseUrl, deviceIds }, "probing rf-003 gateway");

  const session = createGatewaySession(config.rf003, logger);
  const client = createGatewayClient(config.rf003, session, logger);

  try {
    await session.authenticate();

    if (deviceIds.length === 0) {
      const devices = await client.call(gatewayPaths.devices);
      probeLogger.info("rf-003 devices retrieved");
      console.log(JSON.stringify(devices, null, 2));
      return;
    }

    for (const id of deviceIds) {
      probeLogger.info({ id }, "fetching device detail and state");
      const detail = await client.call(gatewayPaths.device(id));
      const state = await client.call(gatewayPaths.deviceState(id));
      console.log(JSON.stringify({ id, detail, state }, null, 2));
    }
  } catch (err) {
    if (err instanceof GatewayError) {
      probeLogger.error({ kind: err.kind, message: err.message }, "gateway error");
    } else {
      probeLogger.error({ err }, "unexpected error");
    }
    process.exit(1);
  }
};

await main();
