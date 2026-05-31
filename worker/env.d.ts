import type { Container } from "@cloudflare/containers";

declare global {
	interface Env {
		API_CONTAINER: DurableObjectNamespace<Container>;
		NODE_ENV: string;
		SLEEP_AFTER: string;
		DATABASE_POOLER_URL: string;
		DATABASE_DIRECT_URL: string;
		CORS_ORIGINS: string;
	}
}

export {};
