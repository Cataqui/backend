// Generated from api-worker-env.d.ts by pnpm cf:types. Do not edit manually.
import type { DurableObjectNamespace, Queue, WorkerVersionMetadata } from "@cloudflare/workers-types/index";

export interface ApiWorkerEnvironment {
	DERIVE_JOB_DATA_QUEUE: Queue;
	WORKER_VERSION_METADATA: WorkerVersionMetadata;
	NODE_ENV: "staging" | "production" | "development";
	SLEEP_AFTER: "5m" | "1h";
	CORS_ORIGINS: "https://staging.cataqui.com" | "https://cataqui.com" | "http://localhost:3000";
	DERIVE_JOB_DATA_AI_GATEWAY_ID:
		| "cataqui-derive-job-data-staging"
		| "cataqui-derive-job-data-production"
		| "cataqui-derive-job-data-development";
	API_CONTAINER_POOL_SIZE: "3" | "10" | "1";
	WHATSAPP_NOTP_RECEIVER: "+15556625497" | "+5511963270517";
	OBSERVABILITY_TRACE_SAMPLE_RATIO: "1" | "0.1";
	OTEL_EXPORTER_OTLP_ENDPOINT: "https://cloudflare.integrations.otlp.datadoghq.com";
	OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE: "delta";
	OTEL_EXPORTER_OTLP_PROTOCOL: "http/protobuf";
	CLOUDFLARE_ACCOUNT_ID: string;
	DATABASE_APP_POOLER_URL: string;
	AI_GATEWAY_API_TOKEN: string;
	UPSTASH_REDIS_REST_URL: string;
	UPSTASH_REDIS_REST_TOKEN: string;
	AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL: string;
	MICROSERVICES_AUTH_JWT_PRIVATE_KEY_V1_PKCS8_BASE64: string;
	OTEL_EXPORTER_OTLP_HEADERS: string;
	API_CONTAINER: DurableObjectNamespace;
}
