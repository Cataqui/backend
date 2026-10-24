import type { DependencyContainer } from "tsyringe";
import type { AiWorkerEnv } from "../cloudflare.config.ts";
import { AuthBinding } from "./auth/auth.repository";
import { AiEnvironment } from "./environment.config";

export function registerDependencies(params: { container: DependencyContainer; environment: AiWorkerEnv }): void {
	params.container.register<AiEnvironment>(AiEnvironment, { useValue: params.environment });
	params.container.register(AuthBinding, { useFactory: () => params.environment.AUTH });
}
