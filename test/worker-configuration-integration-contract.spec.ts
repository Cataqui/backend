import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

type WorkerEnvironment = {
	name: string;
	workers_dev?: boolean;
	containers?: Array<{
		constraints?: { regions?: string[] };
		max_instances?: number;
		rollout_step_percentage?: number | number[];
	}>;
	observability?: { logs?: { head_sampling_rate?: number; invocation_logs?: boolean } };
	vars: {
		API_CONTAINER_POOL_SIZE?: string;
		WHATSAPP_NOTP_PHONE_NUMBER_ID?: string;
		WHATSAPP_NOTP_RECEIVER?: string;
	};
	queues?: unknown;
	services?: Array<{ binding: string; service: string; entrypoint?: string }>;
};

type WorkerConfig = WorkerEnvironment & {
	account_id?: string;
	cache?: { cross_version_cache?: boolean; enabled: boolean };
	exports?: Record<string, { cache?: { enabled: boolean }; type: string }>;
	main: string;
	env: Record<"staging" | "production", WorkerEnvironment>;
};

const repositoryRoot = process.cwd();
const apiConfig = ts.readConfigFile(resolve(repositoryRoot, "apps/api/wrangler.jsonc"), ts.sys.readFile)
	.config as WorkerConfig;
const webhooksConfig = ts.readConfigFile(
	resolve(repositoryRoot, "apps/workers/webhooks/wrangler.jsonc"),
	ts.sys.readFile,
).config as WorkerConfig;

describe("API and Webhooks Worker configuration integration", () => {
	it("should use one deployment account and independent entrypoints", () => {
		expect({
			accounts: [apiConfig.account_id, webhooksConfig.account_id],
			entrypoints: [apiConfig.main, webhooksConfig.main],
		}).toEqual({
			accounts: ["1fca946385505503c59dd6a2a4eeb442", "1fca946385505503c59dd6a2a4eeb442"],
			entrypoints: ["./src/platform/cloudflare/worker/worker.ts", "./src/app.ts"],
		});
	});

	it("should bind every Webhooks environment to the matching private API entrypoint", () => {
		const apiEnvironments = [apiConfig, apiConfig.env.staging, apiConfig.env.production];
		const webhooksEnvironments = [webhooksConfig, webhooksConfig.env.staging, webhooksConfig.env.production];

		expect(
			webhooksEnvironments.map((environment, index) => ({
				binding: environment.services?.[0]?.binding,
				entrypoint: environment.services?.[0]?.entrypoint,
				service: environment.services?.[0]?.service,
				target: apiEnvironments[index]?.name,
			})),
		).toEqual(
			apiEnvironments.map((environment) => ({
				binding: "API_WORKER",
				entrypoint: "ApiContainerInboundEntrypoint",
				service: environment.name,
				target: environment.name,
			})),
		);
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

	it("should isolate Webhooks provider configuration from the API receiver", () => {
		const apiEnvironments = [apiConfig, apiConfig.env.staging, apiConfig.env.production];
		const webhooksEnvironments = [webhooksConfig, webhooksConfig.env.staging, webhooksConfig.env.production];

		expect({
			apiHasPhoneNumberId: apiEnvironments.some(
				(environment) => environment.vars.WHATSAPP_NOTP_PHONE_NUMBER_ID !== undefined,
			),
			apiReceivers: apiEnvironments.map((environment) => environment.vars.WHATSAPP_NOTP_RECEIVER),
			webhooksHasReceiver: webhooksEnvironments.some(
				(environment) => environment.vars.WHATSAPP_NOTP_RECEIVER !== undefined,
			),
			webhooksPhoneNumberIds: webhooksEnvironments.map((environment) => environment.vars.WHATSAPP_NOTP_PHONE_NUMBER_ID),
		}).toEqual({
			apiHasPhoneNumberId: false,
			apiReceivers: ["+15556625497", "+15556625497", "+5511963270517"],
			webhooksHasReceiver: false,
			webhooksPhoneNumberIds: ["1211194405413752", "1211194405413752", "1203689159488121"],
		});
	});

	it("should keep synchronous WhatsApp authentication out of every Queue configuration", () => {
		const workerEnvironments = [
			apiConfig,
			apiConfig.env.staging,
			apiConfig.env.production,
			webhooksConfig,
			webhooksConfig.env.staging,
			webhooksConfig.env.production,
		];

		expect(
			workerEnvironments.some((environment) =>
				JSON.stringify(environment.queues ?? {}).includes("verify-whatsapp-notp"),
			),
		).toBe(false);
	});

	it("should retain all logs while disabling production invocation logs", () => {
		const apiEnvironments = [apiConfig, apiConfig.env.staging, apiConfig.env.production];
		const webhooksEnvironments = [webhooksConfig, webhooksConfig.env.staging, webhooksConfig.env.production];
		const workerEnvironments = [...apiEnvironments, ...webhooksEnvironments];

		expect({
			headSamplingRates: workerEnvironments.map((environment) => environment.observability?.logs?.head_sampling_rate),
			productionInvocationLogs: [
				apiConfig.env.production.observability?.logs?.invocation_logs,
				webhooksConfig.env.production.observability?.logs?.invocation_logs,
			],
			workersDev: workerEnvironments.map((environment) => environment.workers_dev),
		}).toEqual({
			headSamplingRates: [1, 1, 1, 1, 1, 1],
			productionInvocationLogs: [false, false],
			workersDev: [true, false, false, true, false, false],
		});
	});

	it("should keep API container placement and capacity at the API boundary", () => {
		const apiContainerSource = readFileSync(
			resolve(repositoryRoot, "apps/api/src/platform/cloudflare/container/api-container.ts"),
			"utf8",
		);
		const apiEnvironments = [apiConfig, apiConfig.env.staging, apiConfig.env.production];

		expect({
			containerCapacity: apiEnvironments.map((environment) => ({
				maxInstances: environment.containers?.[0]?.max_instances,
				poolSize: environment.vars.API_CONTAINER_POOL_SIZE,
				rolloutStepPercentage: environment.containers?.[0]?.rollout_step_percentage,
			})),
			containerRegions: apiEnvironments.map((environment) => environment.containers?.[0]?.constraints?.regions),
			forwardedToNest: apiContainerSource.includes("API_CONTAINER_POOL_SIZE"),
		}).toEqual({
			containerCapacity: [
				{ maxInstances: 10, poolSize: "1", rolloutStepPercentage: undefined },
				// Restore [10, 50, 100] when staging has at least 3 instances.
				{ maxInstances: 1, poolSize: "1", rolloutStepPercentage: 100 },
				// Restore [10, 25, 50, 100] when production has at least 4 instances.
				{ maxInstances: 1, poolSize: "1", rolloutStepPercentage: 100 },
			],
			containerRegions: [["SAM"], ["SAM"], ["SAM"]],
			forwardedToNest: false,
		});
	});

	it("should keep provider and database secrets out of the opposite Worker interface", () => {
		const apiEnvironmentSource = readFileSync(resolve(repositoryRoot, "apps/api/api-worker-env.d.ts"), "utf8");
		const webhooksEnvironmentSource = readFileSync(
			resolve(repositoryRoot, "apps/workers/webhooks/webhooks-worker-env.d.ts"),
			"utf8",
		);

		expect({
			apiHasOutboundToken: apiEnvironmentSource.includes("WHATSAPP_AUTH_ACCESS_TOKEN"),
			apiHasWebhookSecret: apiEnvironmentSource.includes("META_APP_SECRET"),
			webhooksHasOutboundToken: webhooksEnvironmentSource.includes("WHATSAPP_AUTH_ACCESS_TOKEN"),
			webhooksHasRedisCredentials: webhooksEnvironmentSource.includes("REDIS_"),
			webhooksHasWebhookSecrets:
				webhooksEnvironmentSource.includes("META_APP_SECRET") &&
				webhooksEnvironmentSource.includes("WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN"),
		}).toEqual({
			apiHasOutboundToken: false,
			apiHasWebhookSecret: false,
			webhooksHasOutboundToken: false,
			webhooksHasRedisCredentials: false,
			webhooksHasWebhookSecrets: true,
		});
	});
});
