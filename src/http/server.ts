import { Elysia } from "elysia";

export const createHttpServer = () =>
  new Elysia().get("/healthz", () => ({
    status: "ok" as const,
  }));

export type HttpServer = ReturnType<typeof createHttpServer>;
