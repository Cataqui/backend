import type { Container } from "@cloudflare/containers";
import type { DeriveJobDataMessage } from "./queues/derive-job-data/derive-job-data-message.schema";

declare global {
	interface Env {
		API_CONTAINER: DurableObjectNamespace<Container>;
		DERIVE_JOB_DATA_QUEUE: Queue<DeriveJobDataMessage>;
		NODE_ENV: string;
		SLEEP_AFTER: string;
		DATABASE_APP_POOLER_URL: string;
		CORS_ORIGINS: string;
		PROTOMAP_AUTH_SECRET: string;
		PROTOMAP_URL: string;
		CLOUDFLARE_ACCOUNT_ID: string;
		AI_GATEWAY_API_TOKEN: string;
		CLOUDFLARE_AI_GATEWAY_ID: string;
		UPSTASH_REDIS_REST_URL: string;
		UPSTASH_REDIS_REST_TOKEN: string;
	}
}
