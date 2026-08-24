import { Container, type StopParams } from "@cloudflare/containers";
import { apiContainerOutboundHandlers } from "./outbound/api-container-outbound.handlers";

export class ApiContainer extends Container<Cloudflare.Env> {
	override defaultPort = 3000;
	override pingEndpoint = "localhost/v1/health/live";

	constructor(ctx: ConstructorParameters<typeof Container<Cloudflare.Env>>[0], env: Cloudflare.Env) {
		super(ctx, env);

		this.sleepAfter = env.SLEEP_AFTER;
		this.envVars = {
			NODE_ENV: env.NODE_ENV,
			DATABASE_APP_POOLER_URL: env.DATABASE_APP_POOLER_URL,
			CORS_ORIGINS: env.CORS_ORIGINS,
			CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID,
			DERIVE_JOB_DATA_AI_GATEWAY_API_TOKEN: env.DERIVE_JOB_DATA_AI_GATEWAY_API_TOKEN,
			DERIVE_JOB_DATA_AI_GATEWAY_ID: env.DERIVE_JOB_DATA_AI_GATEWAY_ID,
			UPSTASH_REDIS_REST_URL: env.UPSTASH_REDIS_REST_URL,
			UPSTASH_REDIS_REST_TOKEN: env.UPSTASH_REDIS_REST_TOKEN,
			AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL: env.AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL,
			MICROSERVICES_AUTH_JWT_PRIVATE_KEY_V1_PKCS8_BASE64: env.MICROSERVICES_AUTH_JWT_PRIVATE_KEY_V1_PKCS8_BASE64,
			WHATSAPP_AUTH_RECEIVER: env.WHATSAPP_AUTH_RECEIVER,
		};
	}

	override async fetch(request: Request): Promise<Response> {
		let pathname: string;

		try {
			pathname = decodeURIComponent(new URL(request.url).pathname);
		} catch {
			return new Response(null, { status: 400 });
		}

		if (pathname === "/internal" || pathname.startsWith("/internal/")) return new Response(null, { status: 404 });
		return this.containerFetch(request);
	}

	override onError(error: unknown) {
		const errorName = error instanceof Error ? error.name : "UnknownError";
		const errorMessage = error instanceof Error ? error.message : String(error);
		const errorWithExitCode = error as { exitCode?: unknown };

		console.error({
			event: "api.container.start.failed",
			errorName: errorName,
			errorMessage: errorMessage,
			...(typeof errorWithExitCode.exitCode === "number" ? { exitCode: errorWithExitCode.exitCode } : {}),
			diagnosticEvent: "api.application.start.failed",
		});
	}

	override onStart() {
		console.log("Container started with sleepAfter:", this.sleepAfter);
	}

	override onStop(params: StopParams) {
		const log = params.exitCode === 0 ? console.log : console.error;
		log({
			event: "api.container.stopped",
			exitCode: params.exitCode,
			reason: params.reason,
		});
	}
}

ApiContainer.outboundByHost = apiContainerOutboundHandlers;
