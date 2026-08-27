import { Container, type StopParams } from "@cloudflare/containers";
import {
	getSourceSafeErrorTelemetryFields,
	getWorkerVersion,
	ObservabilityEventConstants,
} from "@cataqui/observability-contracts";
import { apiContainerOutboundHandlers } from "./outbound/api-container-outbound.handlers";

export class ApiContainer extends Container<Cloudflare.Env> {
	override defaultPort = 3000;
	override pingEndpoint = "localhost/v1/health/live";
	private readonly _deploymentEnvironment: string;
	private readonly _workerServiceName: string;
	private readonly _serviceVersion: string;

	constructor(ctx: ConstructorParameters<typeof Container<Cloudflare.Env>>[0], env: Cloudflare.Env) {
		super(ctx, env);

		this._deploymentEnvironment = env.NODE_ENV;
		this._workerServiceName = `cataqui-api-${env.NODE_ENV}`;
		this._serviceVersion = getWorkerVersion({ metadata: env.WORKER_VERSION_METADATA });
		this.sleepAfter = env.SLEEP_AFTER;
		this.envVars = Object.fromEntries(
			Object.entries({
				NODE_ENV: env.NODE_ENV,
				SERVICE_INSTANCE_ID: ctx.id.toString(),
				SERVICE_VERSION: this._serviceVersion,
				DATABASE_APP_POOLER_URL: env.DATABASE_APP_POOLER_URL,
				CORS_ORIGINS: env.CORS_ORIGINS,
				CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID,
				AI_GATEWAY_API_TOKEN: env.AI_GATEWAY_API_TOKEN,
				DERIVE_JOB_DATA_AI_GATEWAY_ID: env.DERIVE_JOB_DATA_AI_GATEWAY_ID,
				UPSTASH_REDIS_REST_URL: env.UPSTASH_REDIS_REST_URL,
				UPSTASH_REDIS_REST_TOKEN: env.UPSTASH_REDIS_REST_TOKEN,
				AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL: env.AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL,
				MICROSERVICES_AUTH_JWT_PRIVATE_KEY_V1_PKCS8_BASE64: env.MICROSERVICES_AUTH_JWT_PRIVATE_KEY_V1_PKCS8_BASE64,
				WHATSAPP_NOTP_RECEIVER: env.WHATSAPP_NOTP_RECEIVER,
				OBSERVABILITY_TRACE_SAMPLE_RATIO: env.OBSERVABILITY_TRACE_SAMPLE_RATIO,
				OTEL_EXPORTER_OTLP_ENDPOINT: env.OTEL_EXPORTER_OTLP_ENDPOINT,
				OTEL_EXPORTER_OTLP_HEADERS: env.OTEL_EXPORTER_OTLP_HEADERS,
				OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE: env.OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE,
				OTEL_EXPORTER_OTLP_PROTOCOL: env.OTEL_EXPORTER_OTLP_PROTOCOL,
			}).filter((environmentVariable) => typeof environmentVariable[1] === "string"),
		);
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
		const exitCode =
			typeof error === "object" && error !== null && "exitCode" in error && typeof error.exitCode === "number"
				? error.exitCode
				: undefined;

		console.error({
			env: this._deploymentEnvironment,
			event: ObservabilityEventConstants.API_CONTAINER_RUNTIME_FAILED_EVENT,
			...getSourceSafeErrorTelemetryFields({ error: error }),
			...(exitCode === undefined ? {} : { exitCode: exitCode }),
			service: this._workerServiceName,
			version: this._serviceVersion,
		});
	}

	override onStart() {
		console.log({
			env: this._deploymentEnvironment,
			event: ObservabilityEventConstants.API_CONTAINER_STARTED_EVENT,
			service: this._workerServiceName,
			sleepAfter: this.sleepAfter,
			version: this._serviceVersion,
		});
	}

	override onStop(params: StopParams) {
		const log = params.exitCode === 0 ? console.log : console.error;
		log({
			env: this._deploymentEnvironment,
			event:
				params.exitCode === 0
					? ObservabilityEventConstants.API_CONTAINER_STOPPED_EVENT
					: ObservabilityEventConstants.API_CONTAINER_STOPPED_UNEXPECTED_EVENT,
			exitCode: params.exitCode,
			reason: params.reason,
			service: this._workerServiceName,
			version: this._serviceVersion,
		});
	}
}

ApiContainer.outboundByHost = apiContainerOutboundHandlers;
