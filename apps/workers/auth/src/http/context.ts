import type { AuthWorkerEnv } from "../../cloudflare.config.ts";
import type { AuthenticatedSession } from "@cataqui/auth-schemas";

export interface AuthVariables {
	requestId: string;
	session: AuthenticatedSession;
}

export interface AuthContext {
	Bindings: AuthWorkerEnv;
	Variables: AuthVariables;
}
