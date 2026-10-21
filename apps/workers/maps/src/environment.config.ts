import type { MapsWorkerEnv } from "../cloudflare.config.ts";

export const MapsEnvironment = Symbol("MapsEnvironment");
export type MapsEnvironment = MapsWorkerEnv;
