import type { AiWorkerEnv } from "../cloudflare.config.ts";

export const AiEnvironment = Symbol("AiEnvironment");
export type AiEnvironment = AiWorkerEnv;
