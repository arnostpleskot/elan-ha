import type { GatewayPath } from "./paths";

export type GatewaySession = {
  authenticate: () => Promise<void>;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
};

export type GatewayClient = {
  call: (path: GatewayPath, init?: RequestInit) => Promise<unknown>;
};

export type GatewayErrorKind = "unauthorized" | "protocol";

export class GatewayError extends Error {
  public readonly kind: GatewayErrorKind;

  constructor(kind: GatewayErrorKind, message: string) {
    super(message);
    this.name = "GatewayError";
    this.kind = kind;
  }
}
