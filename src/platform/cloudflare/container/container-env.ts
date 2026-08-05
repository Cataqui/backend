function fromWorkerEnv(params: { env: Env }): Record<string, string> {
	return {
		NODE_ENV: params.env.NODE_ENV,
		DATABASE_APP_POOLER_URL: params.env.DATABASE_APP_POOLER_URL,
		CORS_ORIGINS: params.env.CORS_ORIGINS,
		PROTOMAP_AUTH_SECRET: params.env.PROTOMAP_AUTH_SECRET,
		PROTOMAP_URL: params.env.PROTOMAP_URL,
		CLOUDFLARE_ACCOUNT_ID: params.env.CLOUDFLARE_ACCOUNT_ID,
		AI_GATEWAY_API_TOKEN: params.env.AI_GATEWAY_API_TOKEN,
		CLOUDFLARE_AI_GATEWAY_ID: params.env.CLOUDFLARE_AI_GATEWAY_ID,
		UPSTASH_REDIS_REST_URL: params.env.UPSTASH_REDIS_REST_URL,
		UPSTASH_REDIS_REST_TOKEN: params.env.UPSTASH_REDIS_REST_TOKEN,
	};
}

export const ContainerEnv = {
	fromWorkerEnv,
} as const;
