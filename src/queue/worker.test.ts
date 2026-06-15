import { describe, expect, mock, test } from "bun:test";
import type { Logger } from "pino";

const capturedOpts: { concurrency: number | undefined } = { concurrency: undefined };

mock.module("bullmq", () => ({
  Worker: class MockWorker {
    constructor(_name: string, _processor: unknown, opts: { concurrency?: number } = {}) {
      capturedOpts.concurrency = opts.concurrency;
    }
  },
}));

const { createGatewayWorker } = await import("./worker");

const fakeLogger = {
  child: () => ({ warn: () => {}, error: () => {}, info: () => {} }),
} as unknown as Logger;

const fakeConnection = { host: "localhost", port: 6379 };

describe("gateway worker", () => {
  test("is created with concurrency 1", () => {
    createGatewayWorker(fakeConnection, fakeLogger);
    expect(capturedOpts.concurrency).toBe(1);
  });
});
