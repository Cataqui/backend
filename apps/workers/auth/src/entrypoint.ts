import { registerAuthDependencies } from "#auth/auth-dependencies";
import { SessionService } from "#auth/session/session.service";
import type { AuthenticatedSession } from "@cataqui/auth-schemas";
import { WorkerEntrypoint } from "cloudflare:workers";
import "reflect-metadata";
import { container } from "tsyringe";
import type { AuthWorkerEnv } from "../cloudflare.config.ts";

export class AuthEntrypoint extends WorkerEntrypoint<AuthWorkerEnv> {
	async resolveSession(params: { accessToken: string }): Promise<AuthenticatedSession | null> {
		const scope = container.createChildContainer();

		try {
			registerAuthDependencies({ container: scope, environment: this.env });

			const session = await scope.resolve(SessionService).getActiveSessionFromAccessTokenOrNull({
				accessToken: params.accessToken,
			});

			return session;
		} finally {
			await scope.dispose();
		}
	}
}
