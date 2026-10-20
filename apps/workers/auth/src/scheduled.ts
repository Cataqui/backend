import "reflect-metadata";
import { container } from "tsyringe";
import type { AuthWorkerEnv } from "../cloudflare.config.ts";
import { registerAuthDependencies } from "./auth-dependencies";
import { UnregisteredScheduleError } from "./errors/unregistered-schedule.error";
import { AuthSchedules } from "./schedules";
import { SessionService } from "./session/session.service";

export async function scheduled(event: ScheduledController, env: AuthWorkerEnv): Promise<void> {
	const scope = container.createChildContainer();

	try {
		registerAuthDependencies({ container: scope, environment: env });

		switch (event.cron) {
			case AuthSchedules.DELETE_EXPIRED_SESSIONS:
				await scope.resolve(SessionService).deleteExpired();
				return;
		}

		throw new UnregisteredScheduleError();
	} finally {
		await scope.dispose();
	}
}
