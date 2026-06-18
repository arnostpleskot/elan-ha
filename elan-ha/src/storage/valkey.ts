import { Redis } from "ioredis";

export type ValkeyConnectionOptions = {
  host: string;
  port: number;
  password?: string;
};

export const createValkeyClient = (url: string): Redis => new Redis(url);

export const parseValkeyConnectionOptions = (url: string): ValkeyConnectionOptions => {
  const parsed = new URL(url);
  const options: ValkeyConnectionOptions = {
    host: parsed.hostname,
    port: Number(parsed.port) || 6379,
  };
  if (parsed.password) {
    options.password = decodeURIComponent(parsed.password);
  }
  return options;
};
