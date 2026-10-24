import type { RequestIdVariables } from "hono/request-id";
import type { AiWorkerEnv } from "../../cloudflare.config.ts";

export interface AiContext {
	Bindings: AiWorkerEnv;
	Variables: RequestIdVariables;
}
