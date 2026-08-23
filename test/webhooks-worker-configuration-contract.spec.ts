import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

type WorkerEnvironment = {
	name: string;
	workers_dev?: boolean;
	containers?: Array<{ constraints?: { regions?: string[] } }>;
	observability?: { logs?: { enabled?: boolean; head_sampling_rate?: number; invocation_logs?: boolean } };
	vars: {
		API_CONTAINER_POOL_SIZE?: string;
		WHATSAPP_AUTH_PHONE_NUMBER_ID?: string;
		WHATSAPP_AUTH_RECEIVER?: string;
	};
	queues?: {
		producers?: Array<{ binding: string; queue: string }>;
		consumers?: Array<{
			queue: string;
			max_batch_size: number;
			max_batch_timeout: number;
			max_concurrency: number;
			max_retries: number;
			retry_delay: number;
			dead_letter_queue: string;
		}>;
	};
	services?: Array<{ binding: string; service: string; entrypoint?: string }>;
	routes?: Array<{ pattern: string; custom_domain: boolean }>;
};

type WorkerConfig = WorkerEnvironment & {
	account_id: string;
	cache?: { cross_version_cache?: boolean; enabled: boolean };
	exports?: Record<string, { cache?: { enabled: boolean }; type: string }>;
	main: string;
	durable_objects?: unknown;
	env: Record<"staging" | "production", WorkerEnvironment>;
};

const apiConfig = ts.readConfigFile(
	resolve(process.cwd(), "src/platform/cloudflare/workers/api/wrangler.jsonc"),
	ts.sys.readFile,
).config as WorkerConfig;
const webhooksConfig = ts.readConfigFile(
	resolve(process.cwd(), "src/platform/cloudflare/workers/webhooks/wrangler.jsonc"),
	ts.sys.readFile,
).config as WorkerConfig;
const packageScripts = (
	JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
		scripts: Record<string, string>;
	}
).scripts;

describe("Webhooks Worker configuration", () => {
	it("should commit the public Cloudflare deployment account in every Worker configuration", () => {
		expect({ api: apiConfig.account_id, webhooks: webhooksConfig.account_id }).toEqual({
			api: "1fca946385505503c59dd6a2a4eeb442",
			webhooks: "1fca946385505503c59dd6a2a4eeb442",
		});
	});

	it("should use generic Webhooks Worker names in every environment", () => {
		expect([webhooksConfig.name, webhooksConfig.env.staging.name, webhooksConfig.env.production.name]).toEqual([
			"cataqui-webhooks-development",
			"cataqui-webhooks-staging",
			"cataqui-webhooks-production",
		]);
	});

	it("should use independent API and Webhooks Worker entrypoints", () => {
		expect({ api: apiConfig.main, webhooks: webhooksConfig.main }).toEqual({
			api: "./worker.ts",
			webhooks: "./app.ts",
		});
	});

	it("should cache only the API public-JWKS entrypoint without sharing entries across versions", () => {
		expect({ cache: apiConfig.cache, exports: apiConfig.exports }).toEqual({
			cache: { enabled: false, cross_version_cache: false },
			exports: {
				MicroservicesAuthJwksEntrypoint: {
					type: "worker",
					cache: { enabled: true },
				},
			},
		});
	});

	it("should configure the reviewed Meta phone number ID only in the Webhooks Worker", () => {
		expect({
			apiHasPhoneNumberId: [apiConfig, apiConfig.env.staging, apiConfig.env.production].some(
				(config) => config.vars.WHATSAPP_AUTH_PHONE_NUMBER_ID !== undefined,
			),
			webhooks: [
				webhooksConfig.vars.WHATSAPP_AUTH_PHONE_NUMBER_ID,
				webhooksConfig.env.staging.vars.WHATSAPP_AUTH_PHONE_NUMBER_ID,
				webhooksConfig.env.production.vars.WHATSAPP_AUTH_PHONE_NUMBER_ID,
			],
		}).toEqual({
			apiHasPhoneNumberId: false,
			webhooks: ["1211194405413752", "1211194405413752", "1203689159488121"],
		});
	});

	it("should configure the inbound authentication code receiver only in the API Worker", () => {
		expect({
			api: [
				apiConfig.vars.WHATSAPP_AUTH_RECEIVER,
				apiConfig.env.staging.vars.WHATSAPP_AUTH_RECEIVER,
				apiConfig.env.production.vars.WHATSAPP_AUTH_RECEIVER,
			],
			webhooksHasCodeReceiver: [webhooksConfig, webhooksConfig.env.staging, webhooksConfig.env.production].some(
				(config) => config.vars.WHATSAPP_AUTH_RECEIVER !== undefined,
			),
		}).toEqual({
			api: ["+15556625497", "+15556625497", "+5511963270517"],
			webhooksHasCodeReceiver: false,
		});
	});

	it("should deliver WhatsApp authentication directly through a private API Worker entrypoint", () => {
		expect(
			[webhooksConfig, webhooksConfig.env.staging, webhooksConfig.env.production].map((config) => config.services?.[0]),
		).toEqual([
			{
				binding: "API_WORKER",
				service: "cataqui-api-development",
				entrypoint: "ApiContainerInboundEntrypoint",
			},
			{
				binding: "API_WORKER",
				service: "cataqui-api-staging",
				entrypoint: "ApiContainerInboundEntrypoint",
			},
			{
				binding: "API_WORKER",
				service: "cataqui-api-production",
				entrypoint: "ApiContainerInboundEntrypoint",
			},
		]);
	});

	it("should keep WhatsApp authentication out of Cloudflare Queues", () => {
		const allWorkerConfigurations = [
			apiConfig,
			apiConfig.env.staging,
			apiConfig.env.production,
			webhooksConfig,
			webhooksConfig.env.staging,
			webhooksConfig.env.production,
		];

		expect(
			allWorkerConfigurations.some((config) =>
				JSON.stringify(config.queues ?? {}).includes("verify-whatsapp-auth-message"),
			),
		).toBe(false);
	});

	it("should expose the Webhooks Worker through dedicated custom domains", () => {
		expect({
			staging: webhooksConfig.env.staging.routes,
			production: webhooksConfig.env.production.routes,
		}).toEqual({
			staging: [{ pattern: "staging.webhooks.cataqui.com", custom_domain: true }],
			production: [{ pattern: "webhooks.cataqui.com", custom_domain: true }],
		});
	});

	it("should disable workers.dev outside development for both Workers", () => {
		expect({
			api: [apiConfig.workers_dev, apiConfig.env.staging.workers_dev, apiConfig.env.production.workers_dev],
			webhooks: [
				webhooksConfig.workers_dev,
				webhooksConfig.env.staging.workers_dev,
				webhooksConfig.env.production.workers_dev,
			],
		}).toEqual({ api: [true, false, false], webhooks: [true, false, false] });
	});

	it("should keep containers and Durable Objects out of the Webhooks Worker", () => {
		expect({ containers: webhooksConfig.containers, durableObjects: webhooksConfig.durable_objects }).toEqual({
			containers: undefined,
			durableObjects: undefined,
		});
	});

	it("should retain every API and webhook log so errors are never removed by head sampling", () => {
		const workerEnvironments = [
			apiConfig,
			apiConfig.env.staging,
			apiConfig.env.production,
			webhooksConfig,
			webhooksConfig.env.staging,
			webhooksConfig.env.production,
		];

		expect(workerEnvironments.map((config) => config.observability?.logs?.head_sampling_rate)).toEqual(
			Array.from({ length: workerEnvironments.length }, () => 1),
		);
	});

	it("should avoid writing an automatic invocation log for every production request", () => {
		expect({
			api: apiConfig.env.production.observability?.logs?.invocation_logs,
			webhooks: webhooksConfig.env.production.observability?.logs?.invocation_logs,
		}).toEqual({ api: false, webhooks: false });
	});

	it("should keep every API container close to the South American application data", () => {
		expect(
			[apiConfig, apiConfig.env.staging, apiConfig.env.production].map(
				(config) => config.containers?.[0]?.constraints?.regions,
			),
		).toEqual([["SAM"], ["SAM"], ["SAM"]]);
	});

	it("should configure API container pool sizes without forwarding the Worker-only size to Nest", () => {
		const containerEnvSource = readFileSync(
			resolve(process.cwd(), "src/platform/cloudflare/containers/api/api-container.ts"),
			"utf8",
		);

		expect({
			poolSizes: [
				apiConfig.vars.API_CONTAINER_POOL_SIZE,
				apiConfig.env.staging.vars.API_CONTAINER_POOL_SIZE,
				apiConfig.env.production.vars.API_CONTAINER_POOL_SIZE,
			],
			forwardedToNest: containerEnvSource.includes("API_CONTAINER_POOL_SIZE"),
		}).toEqual({ poolSizes: ["1", "3", "10"], forwardedToNest: false });
	});

	it("should generate secret-isolated environment interfaces for both Workers", () => {
		const apiEnvSource = readFileSync(
			resolve(process.cwd(), "src/platform/cloudflare/workers/api/api-worker-env.d.ts"),
			"utf8",
		);
		const webhooksEnvSource = readFileSync(
			resolve(process.cwd(), "src/platform/cloudflare/workers/webhooks/webhooks-worker-env.d.ts"),
			"utf8",
		);

		expect({
			apiHasOutboundToken: apiEnvSource.includes("WHATSAPP_AUTH_ACCESS_TOKEN"),
			apiHasWebhookSecret: apiEnvSource.includes("META_APP_SECRET"),
			webhooksHasOutboundToken: webhooksEnvSource.includes("WHATSAPP_AUTH_ACCESS_TOKEN"),
			webhooksHasWebhookSecrets:
				webhooksEnvSource.includes("META_APP_SECRET") &&
				webhooksEnvSource.includes("WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN"),
			webhooksHasRedisCredentials: webhooksEnvSource.includes("UPSTASH_REDIS"),
		}).toEqual({
			apiHasOutboundToken: false,
			apiHasWebhookSecret: false,
			webhooksHasOutboundToken: false,
			webhooksHasWebhookSecrets: true,
			webhooksHasRedisCredentials: false,
		});
	});

	it("should generate the API Worker RPC methods from both Worker configurations", () => {
		const webhooksEnvSource = readFileSync(
			resolve(process.cwd(), "src/platform/cloudflare/workers/webhooks/webhooks-worker-env.d.ts"),
			"utf8",
		);

		expect(webhooksEnvSource).toContain('Service<typeof import("../api/worker").ApiContainerInboundEntrypoint>');
	});

	it("should load the shared root environment file for local Worker development", () => {
		expect({
			combined: packageScripts["cf:dev"],
			api: packageScripts["cf:dev:api"],
			webhooks: packageScripts["cf:dev:webhooks"],
		}).toEqual({
			combined:
				'wrangler dev --cwd src/platform/cloudflare/workers/webhooks --config wrangler.jsonc --config ../api/wrangler.jsonc --env-file "$PWD/.env"',
			api: 'wrangler dev --cwd src/platform/cloudflare/workers/api --config wrangler.jsonc --env-file "$PWD/.env"',
			webhooks:
				'wrangler dev --cwd src/platform/cloudflare/workers/webhooks --config wrangler.jsonc --env-file "$PWD/.env"',
		});
	});
});
