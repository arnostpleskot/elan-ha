import { Elysia } from "elysia";
import type { ReadinessResult } from "../observability/readiness";

type HttpServerDeps = {
  getReadiness: () => Promise<ReadinessResult>;
  forceDiscovery: () => Promise<void>;
  getDevices: () => Promise<unknown[]>;
};

export const createHttpServer = ({ getReadiness, forceDiscovery, getDevices }: HttpServerDeps) =>
  new Elysia()
    .get("/healthz", () => ({ status: "ok" as const }))
    .get("/readyz", async ({ set }) => {
      const result = await getReadiness();
      if (!result.ready) {
        set.status = 503;
      }
      return result;
    })
    .get("/devices", async () => getDevices())
    .post("/discovery/force", async ({ set }) => {
      await forceDiscovery();
      set.status = 202;
      return { status: "queued" as const };
    });

export type HttpServer = ReturnType<typeof createHttpServer>;
