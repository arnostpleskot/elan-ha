import makeFetchCookie from "fetch-cookie";
import type { Logger } from "pino";
import { CookieJar } from "tough-cookie";
import type { AppConfig } from "../config/env";
import { GatewayError, type GatewaySession } from "./types";

const sha1Hex = (input: string): string =>
  new Bun.CryptoHasher("sha1").update(input).digest("hex");

export const createGatewaySession = (
  config: AppConfig["rf003"],
  logger: Logger,
): GatewaySession => {
  const sessionLogger = logger.child({ module: "gateway" });
  const jar = new CookieJar();
  const fetchWithCookies = makeFetchCookie(fetch as unknown as typeof fetch, jar);

  return {
    fetch: (url, init) => fetchWithCookies(url, init as Parameters<typeof fetchWithCookies>[1]),
    authenticate: async () => {
      const body = new URLSearchParams();
      body.append("name", config.username);
      body.append("key", sha1Hex(config.password));

      const response = await fetchWithCookies(`${config.baseUrl}/login`, {
        method: "POST",
        body,
      });

      if (!response.ok) {
        throw new GatewayError("unauthorized", `Login failed: HTTP ${response.status}`);
      }

      sessionLogger.info("rf-003 authenticated");
    },
  };
};
