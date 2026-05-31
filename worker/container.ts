import { Container } from "@cloudflare/containers";

export class ApiContainer extends Container {
	defaultPort = 3000;

	constructor(ctx: DurableObjectState<object>, env: Env) {
		super(ctx, env);
		this.sleepAfter = env.SLEEP_AFTER ?? "5m";
	}

	envVars = {
		NODE_ENV: "production",
	};
}
