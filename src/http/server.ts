import { Elysia } from "elysia";
import type { ReadinessResult } from "../observability/readiness";

type HttpServerDeps = {
  getReadiness: () => Promise<ReadinessResult>;
};

export const createHttpServer = ({ getReadiness }: HttpServerDeps) =>
  new Elysia()
    .get("/healthz", () => ({ status: "ok" as const }))
    .get("/readyz", async ({ set }) => {
      const result = await getReadiness();
      if (!result.ready) {
        set.status = 503;
      }
      return result;
    });

export type HttpServer = ReturnType<typeof createHttpServer>;
