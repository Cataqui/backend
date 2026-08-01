import { Container } from "@cloudflare/containers";
import { ContainerEnv } from "./container-env";
import { OutboundHandlers } from "./outbound/outbound-handlers";

export class ApiContainer extends Container<Env> {
	defaultPort = 3000;

	constructor(ctx: ConstructorParameters<typeof Container<Env>>[0], env: Env) {
		super(ctx, env);

		this.sleepAfter = env.SLEEP_AFTER;
		this.envVars = ContainerEnv.fromWorkerEnv({ env: env });
	}

	override async fetch(request: Request): Promise<Response> {
		if (new URL(request.url).pathname.startsWith("/internal")) return new Response(null, { status: 404 });
		return this.containerFetch(request);
	}

	override onError(error: unknown) {
		if (error instanceof Error && "exitCode" in error) {
			const exitCode = (error as Error & { exitCode: number }).exitCode;
			console.error(
				`Container exited with code ${exitCode}. Check "wrangler tail" or Cloudflare dashboard logs for the startup error.`,
			);
			return;
		}

		console.error("Container errored:", error);
	}

	override onStart() {
		console.log("Container started with sleepAfter:", this.sleepAfter);
	}

	override onStop() {
		console.log("Container stopped");
	}
}

ApiContainer.outboundByHost = OutboundHandlers;
