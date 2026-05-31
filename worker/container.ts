import { Container } from "@cloudflare/containers";

export class ApiContainer extends Container {
	defaultPort = 3000;

	constructor(ctx: DurableObjectState<object>, env: Env) {
		super(ctx, env);
		this.sleepAfter = env.SLEEP_AFTER;
		this.envVars = {
			NODE_ENV: env.NODE_ENV,
			DATABASE_POOLER_URL: env.DATABASE_POOLER_URL,
			DATABASE_DIRECT_URL: env.DATABASE_DIRECT_URL,
			CORS_ORIGINS: env.CORS_ORIGINS,
		};
	}
}
