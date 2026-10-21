import type { AuthWorkerEnv } from "../cloudflare.config.ts";

export const AuthEnvironment = Symbol("AuthEnvironment");
export type AuthEnvironment = AuthWorkerEnv;
