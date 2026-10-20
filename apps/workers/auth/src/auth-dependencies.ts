import { Redis } from "@upstash/redis";
import { instanceCachingFactory, type DependencyContainer } from "tsyringe";
import type { AuthWorkerEnv } from "../cloudflare.config.ts";
import { AuthDatabase } from "./database/auth-database";
import { AuthEnvironment } from "./environment.config";
import { PrismaClient } from "./generated/prisma/client";
import { RedisConfig } from "./redis/redis.config";

export function registerAuthDependencies(params: { container: DependencyContainer; environment: AuthWorkerEnv }): void {
	params.container.register<AuthEnvironment>(AuthEnvironment, { useValue: params.environment });

	params.container.register(PrismaClient, {
		useFactory: (container) => container.resolve(AuthDatabase).client,
	});

	params.container.register(Redis, {
		useFactory: instanceCachingFactory((container) => {
			const config = container.resolve<RedisConfig>(RedisConfig);

			return new Redis({
				url: config.url,
				token: config.token,
				enableAutoPipelining: config.enableAutoPipelining,
			});
		}),
	});
}
