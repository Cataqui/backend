import { Container } from "@cloudflare/containers";

export class ApiContainer extends Container {
	defaultPort = 3000;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx as any, env);

		this.sleepAfter = env.SLEEP_AFTER;
		this.envVars = {
			NODE_ENV: env.NODE_ENV,
			DATABASE_POOLER_URL: env.DATABASE_POOLER_URL,
			DATABASE_DIRECT_URL: env.DATABASE_DIRECT_URL,
			CORS_ORIGINS: env.CORS_ORIGINS,
			PROTOMAP_AUTH_SECRET: env.PROTOMAP_AUTH_SECRET,
			PROTOMAP_URL: env.PROTOMAP_URL,
		};
	}

	onError(error: unknown) {
		console.error("Container errored:", error);
	}

	onStart() {
		console.log("Container started with sleepAfter:", this.sleepAfter);
	}

	onStop() {
		console.log("Container stopped");
	}
}
