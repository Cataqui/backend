import type { ApiWorkerEnv } from "../cloudflare.config.ts";
import { loadAndParseConfig, type ParsedInputConfig } from "@cloudflare/config";
import { resolve } from "node:path";
import { afterEach, expectTypeOf, vi } from "vitest";

afterEach(() => vi.unstubAllEnvs());

async function _configuration(mode: string | undefined): Promise<ParsedInputConfig> {
	const loaded = await loadAndParseConfig(resolve(import.meta.dirname, "../cloudflare.config.ts"), {
		mode: mode,
		isPreview: false,
	});
	if (!loaded.result.success) throw loaded.result.error;
	return loaded.result.data;
}

it.each(["development", "staging", "production"])(
	"keeps %s Service targets independent of Auth deployment credentials",
	async (mode) => {
		vi.stubEnv("HYPERDRIVE_ID", undefined);
		const configuration = await _configuration(mode);
		expect(configuration.worker?.env).not.toHaveProperty("CONTAINER");
		expect(configuration.worker?.env).toMatchObject({
			MAPS: { type: "worker", worker: `cataqui-maps-${mode}`, exportName: "WorkerEntrypoint" },
			AUTH: { type: "worker", worker: `cataqui-auth-${mode}`, exportName: "AuthEntrypoint" },
		});
	},
);

it.each([
	{ mode: "development", name: "cataqui-api-development-apicontainer", instanceType: "basic", rollout: undefined },
	{
		mode: "staging",
		name: "cataqui-api-staging-apicontainer-staging",
		instanceType: "basic",
		rollout: { activeGracePeriod: 60, stepPercentage: 100 },
	},
	{
		mode: "production",
		name: "cataqui-api-production-apicontainer-production",
		instanceType: "standard-1",
		rollout: { activeGracePeriod: 300, stepPercentage: 100 },
	},
])("preserves the deployed Container identity and rollout in $mode", async (scenario) => {
	const configuration = await _configuration(scenario.mode);
	expect(configuration.containers[0]).toMatchObject({
		name: scenario.name,
		instanceType: scenario.instanceType,
		maxInstances: 1,
		constraints: { regions: ["SAM"] },
		...(scenario.rollout ? { rollout: scenario.rollout } : {}),
	});
});

it.each([
	{ mode: "development", domains: [], workersDev: true, sleep: 300000, origins: "http://localhost:3000" },
	{
		mode: "staging",
		domains: ["staging.api.cataqui.com"],
		workersDev: false,
		sleep: 300000,
		origins: "https://staging.cataqui.com",
	},
	{
		mode: "production",
		domains: ["api.cataqui.com"],
		workersDev: false,
		sleep: 3600000,
		origins: "https://cataqui.com",
	},
])("preserves public routing and container runtime values in $mode", async (scenario) => {
	const configuration = await _configuration(scenario.mode);
	expect(configuration.worker).toMatchObject({
		name: `cataqui-api-${scenario.mode}`,
		domains: scenario.domains,
		workersDev: scenario.workersDev,
		cache: { enabled: false, crossVersionCache: false },
		env: {
			ENVIRONMENT: { type: "text", value: scenario.mode },
			SLEEP_AFTER_MS: { type: "json", value: scenario.sleep },
			CORS_ORIGINS: { type: "text", value: scenario.origins },
			AI_GATEWAY_ID: { type: "text", value: `cataqui-api-${scenario.mode}` },
		},
	});
});

it("declares secrets without embedding the local environment into build output", async () => {
	vi.stubEnv("DATABASE_APP_POOLER_URL", "never-inline-this-secret");
	const configuration = await _configuration(undefined);
	expect(configuration.worker?.env).toMatchObject({
		CLOUDFLARE_ACCOUNT_ID: { type: "text", value: "1fca946385505503c59dd6a2a4eeb442" },
		DATABASE_APP_POOLER_URL: { type: "secret" },
		AI_GATEWAY_API_TOKEN: { type: "secret" },
		UPSTASH_REDIS_REST_URL: { type: "secret" },
		UPSTASH_REDIS_REST_TOKEN: { type: "secret" },
	});
});

it("preserves durable namespace storage and portal cache behavior", async () => {
	const configuration = await _configuration("production");
	expect(configuration.worker?.exports).toMatchObject({
		ApiContainer: {
			type: "durable-object",
			storage: "sqlite",
			container: "cataqui-api-production-apicontainer-production",
		},
		ApiWorkerPortal: { type: "worker", cache: { enabled: false } },
	});
});

it("rejects modes that would select an unintended deployed Worker", async () => {
	await expect(_configuration("preview")).rejects.toThrow();
});

it("infers the named Auth RPC method from the configuration reference", () => {
	expectTypeOf<ApiWorkerEnv["AUTH"]["resolveSession"]>().parameter(0).toEqualTypeOf<{ accessToken: string }>();
});
