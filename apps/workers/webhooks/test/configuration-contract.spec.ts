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
	main: string;
	durable_objects?: unknown;
	env: Record<"staging" | "production", WorkerEnvironment>;
};

const webhooksConfig = ts.readConfigFile(resolve(process.cwd(), "wrangler.jsonc"), ts.sys.readFile)
	.config as WorkerConfig;
const packageScripts = (
	JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
		scripts: Record<string, string>;
	}
).scripts;

describe("Webhooks Worker configuration", () => {
	it("should commit the public Cloudflare deployment account", () => {
		expect(webhooksConfig.account_id).toBe("1fca946385505503c59dd6a2a4eeb442");
	});

	it("should use generic Webhooks Worker names in every environment", () => {
		expect([webhooksConfig.name, webhooksConfig.env.staging.name, webhooksConfig.env.production.name]).toEqual([
			"cataqui-webhooks-development",
			"cataqui-webhooks-staging",
			"cataqui-webhooks-production",
		]);
	});

	it("should use its independent Worker entrypoint", () => {
		expect(webhooksConfig.main).toBe("./src/app.ts");
	});

	it("should configure the reviewed Meta phone number IDs", () => {
		expect([
			webhooksConfig.vars.WHATSAPP_AUTH_PHONE_NUMBER_ID,
			webhooksConfig.env.staging.vars.WHATSAPP_AUTH_PHONE_NUMBER_ID,
			webhooksConfig.env.production.vars.WHATSAPP_AUTH_PHONE_NUMBER_ID,
		]).toEqual(["1211194405413752", "1211194405413752", "1203689159488121"]);
	});

	it("should not own the inbound authentication code receiver", () => {
		expect(
			[webhooksConfig, webhooksConfig.env.staging, webhooksConfig.env.production].some(
				(config) => config.vars.WHATSAPP_AUTH_RECEIVER !== undefined,
			),
		).toBe(false);
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
		const allWorkerConfigurations = [webhooksConfig, webhooksConfig.env.staging, webhooksConfig.env.production];

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

	it("should disable workers.dev outside development", () => {
		expect([
			webhooksConfig.workers_dev,
			webhooksConfig.env.staging.workers_dev,
			webhooksConfig.env.production.workers_dev,
		]).toEqual([true, false, false]);
	});

	it("should keep containers and Durable Objects out of the Webhooks Worker", () => {
		expect({ containers: webhooksConfig.containers, durableObjects: webhooksConfig.durable_objects }).toEqual({
			containers: undefined,
			durableObjects: undefined,
		});
	});

	it("should retain every webhook log so errors are never removed by head sampling", () => {
		const workerEnvironments = [webhooksConfig, webhooksConfig.env.staging, webhooksConfig.env.production];

		expect(workerEnvironments.map((config) => config.observability?.logs?.head_sampling_rate)).toEqual(
			Array.from({ length: workerEnvironments.length }, () => 1),
		);
	});

	it("should avoid writing an automatic invocation log for every production request", () => {
		expect(webhooksConfig.env.production.observability?.logs?.invocation_logs).toBe(false);
	});

	it("should generate a secret-isolated environment interface", () => {
		const webhooksEnvSource = readFileSync(resolve(process.cwd(), "webhooks-worker-env.d.ts"), "utf8");

		expect({
			webhooksHasOutboundToken: webhooksEnvSource.includes("WHATSAPP_AUTH_ACCESS_TOKEN"),
			webhooksHasWebhookSecrets:
				webhooksEnvSource.includes("META_APP_SECRET") &&
				webhooksEnvSource.includes("WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN"),
			webhooksHasRedisCredentials: webhooksEnvSource.includes("UPSTASH_REDIS"),
		}).toEqual({
			webhooksHasOutboundToken: false,
			webhooksHasWebhookSecrets: true,
			webhooksHasRedisCredentials: false,
		});
	});

	it("should type the API service binding through the shared inbound package", () => {
		const typedEnvironmentSource = readFileSync(resolve(process.cwd(), "src/webhooks-worker-environment.d.ts"), "utf8");
		const generatedEnvironmentSource = readFileSync(resolve(process.cwd(), "webhooks-worker-env.d.ts"), "utf8");

		expect({
			usesSharedInterface: typedEnvironmentSource.includes("IApiContainerInboundWorker"),
			doesNotImportApiApplication: !generatedEnvironmentSource.includes("apps/api"),
		}).toEqual({ usesSharedInterface: true, doesNotImportApiApplication: true });
	});

	it("should expose an independent development and deployment lifecycle", () => {
		expect({
			development: packageScripts["cf:dev"],
			stagingDeployment: packageScripts["cf:deploy:staging"],
			productionDeployment: packageScripts["cf:deploy:production"],
			typecheck: packageScripts["typecheck"],
		}).toEqual({
			development: 'wrangler dev --config wrangler.jsonc --env-file "$PWD/../../../.env"',
			stagingDeployment: "wrangler deploy --config wrangler.jsonc --env staging",
			productionDeployment: "wrangler deploy --config wrangler.jsonc --env production",
			typecheck: "tsc --noEmit && pnpm cf:types:check",
		});
	});
});
