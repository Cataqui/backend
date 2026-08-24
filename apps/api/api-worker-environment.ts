// Generated from api-worker-env.d.ts by pnpm cf:types. Do not edit manually.
import type { DurableObjectNamespace, Queue } from "@cloudflare/workers-types/index";

export interface ApiWorkerEnvironment {
	DERIVE_JOB_DATA_QUEUE: Queue;
	NODE_ENV: "staging" | "production" | "development";
	SLEEP_AFTER: "5m" | "1h";
	CORS_ORIGINS: "https://staging.cataqui.com" | "https://cataqui.com" | "http://localhost:3000";
	CLOUDFLARE_AI_GATEWAY_ID: "staging" | "production" | "development";
	API_CONTAINER_POOL_SIZE: "3" | "10" | "1";
	WHATSAPP_AUTH_RECEIVER: "+15556625497" | "+5511963270517";
	CLOUDFLARE_ACCOUNT_ID: string;
	DATABASE_APP_POOLER_URL: string;
	AI_GATEWAY_API_TOKEN: string;
	REDIS_URL: string;
	REDIS_USERNAME: string;
	REDIS_PASSWORD: string;
	AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL: string;
	MICROSERVICES_AUTH_JWT_PRIVATE_KEY_V1_PKCS8_BASE64: string;
	API_CONTAINER: DurableObjectNamespace;
	REDIS_CA_CERT_BASE64?: string;
}
