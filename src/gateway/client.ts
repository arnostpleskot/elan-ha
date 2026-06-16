import type { Logger } from "pino";
import type { AppConfig } from "../config/env";
import { parseGatewayResponse } from "./parser";
import type { GatewayPath } from "./paths";
import { GatewayError, type GatewayClient, type GatewaySession } from "./types";

const DEFAULT_INIT: RequestInit = { method: "GET" };

const methodFor = (init: RequestInit): string => init.method ?? "GET";

export const createGatewayClient = (
  config: AppConfig["rf003"],
  session: GatewaySession,
  logger: Logger,
): GatewayClient => {
  const clientLogger = logger.child({ module: "gateway" });

  const buildUrl = (path: GatewayPath): string => `${config.baseUrl}/api/${path}`;

  return {
    call: async (path, init = DEFAULT_INIT) => {
      const url = buildUrl(path);

      clientLogger.debug({ path, method: methodFor(init) }, "rf-003 request");
      let response = await session.fetch(url, init);

      if (response.status === 401) {
        clientLogger.info({ path }, "received 401, re-authenticating");
        await session.authenticate();
        clientLogger.debug({ path, method: methodFor(init), retry: true }, "rf-003 request");
        response = await session.fetch(url, init);
      }

      if (response.status === 401) {
        throw new GatewayError("unauthorized", `Still 401 after re-auth: ${path}`);
      }

      if (!response.ok) {
        throw new GatewayError("protocol", `HTTP ${response.status} for ${path}`);
      }

      const body = await parseGatewayResponse(response);
      clientLogger.debug(
        { path, status: response.status, contentType: response.headers.get("content-type") ?? "", body },
        "rf-003 response",
      );
      return body;
    },
  };
};
