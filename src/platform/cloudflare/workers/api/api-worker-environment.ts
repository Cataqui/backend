// Generated from api-worker-env.d.ts by pnpm cf:types. Do not edit manually.
import type { DurableObjectNamespace, Queue } from "@cloudflare/workers-types/index";

export interface ApiWorkerEnvironment {
	DERIVE_JOB_DATA_QUEUE: Queue;
	NODE_ENV: "staging" | "production" | "development";
	SLEEP_AFTER: "5m" | "1h";
	CORS_ORIGINS: "https://staging.cataqui.com" | "https://cataqui.com" | "http://localhost:3000";
	CLOUDFLARE_ACCOUNT_ID: "1fca946385505503c59dd6a2a4eeb442" | "your-account-id";
	CLOUDFLARE_AI_GATEWAY_ID: "staging" | "production" | "development";
	API_CONTAINER_POOL_SIZE: "3" | "10" | "1";
	WHATSAPP_AUTH_RECEIVER: "+15556625497" | "+5511963270517";
	DATABASE_APP_POOLER_URL: string;
	AI_GATEWAY_API_TOKEN: string;
	UPSTASH_REDIS_REST_URL: string;
	UPSTASH_REDIS_REST_TOKEN: string;
	AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL: string;
	API_CONTAINER: DurableObjectNamespace;
}
