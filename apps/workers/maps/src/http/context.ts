import type { MapsWorkerEnv } from "../../cloudflare.config.ts";
import type { RequestIdVariables } from "hono/request-id";
export interface MapsContext {
	Bindings: MapsWorkerEnv;
	Variables: RequestIdVariables & { authenticatedAccountId: string };
}
