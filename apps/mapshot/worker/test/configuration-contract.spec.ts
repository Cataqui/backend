import { loadAndParseConfig, type ParsedInputConfig } from "@cloudflare/config";
import { resolve } from "node:path";
import { afterEach, vi } from "vitest";

afterEach(() => vi.unstubAllEnvs());

async function _configuration(mode: string | undefined): Promise<ParsedInputConfig> {
	const loaded = await loadAndParseConfig(resolve(import.meta.dirname, "../cloudflare.config.ts"), {
		mode: mode,
		isPreview: false,
	});
	if (!loaded.result.success) throw loaded.result.error;
	return loaded.result.data;
}

it.each(["development", "staging", "production"])("preserves private rendering resources in %s", async (mode) => {
	vi.stubEnv("MAPSHOT_CONTAINER_IMAGE", undefined);
	const configuration = await _configuration(mode);
	expect(configuration.worker?.env).not.toHaveProperty("CONTAINER");
	expect(configuration).toMatchObject({
		accountId: "1fca946385505503c59dd6a2a4eeb442",
		worker: {
			name: `cataqui-mapshot-${mode}`,
			workersDev: false,
			previewUrls: false,
			compatibilityFlags: ["nodejs_compat", "enable_request_signal"],
			exports: {
				MapshotContainer: { type: "durable-object", storage: "sqlite", container: `cataqui-mapshot-${mode}` },
			},
			env: {
				R2: { type: "r2", name: `cataqui-mapshot-${mode}` },
				ENVIRONMENT: { type: "text", value: mode },
			},
			observability: { enabled: true, logs: { enabled: true, headSamplingRate: 1, invocationLogs: false } },
		},
		containers: [
			{
				name: `cataqui-mapshot-${mode}`,
				image: { dockerfile: "../Dockerfile", buildContext: "../../.." },
				schedulingPolicy: "default",
				instanceType: "standard-3",
				maxInstances: 1,
			},
		],
	});
});

it.each(["development", "staging"])("keeps the current container idle setting in %s", async (mode) => {
	const configuration = await _configuration(mode);
	expect(configuration.worker?.env?.["SLEEP_AFTER_MS"]).toEqual({ type: "json", value: 600000 });
});

it("leaves production idle policy to the existing container default", async () => {
	const configuration = await _configuration("production");
	expect(configuration.worker?.env).not.toHaveProperty("SLEEP_AFTER_MS");
});

it("uses the immutable image selected by release packaging", async () => {
	const image = `registry.cloudflare.com/account/cataqui-mapshot@sha256:${"a".repeat(64)}`;
	vi.stubEnv("MAPSHOT_CONTAINER_IMAGE", image);
	const configuration = await _configuration("staging");
	expect(configuration.containers[0]).toMatchObject({ image: { reference: image } });
});

it("keeps both private portal exports uncached", async () => {
	const configuration = await _configuration(undefined);
	expect(configuration.worker?.exports).toMatchObject({
		MapshotWorkerPortal: { type: "worker", cache: { enabled: false } },
		ContainerProxy: { type: "worker", cache: { enabled: false } },
	});
});

it("rejects modes that would select an unintended deployed Worker", async () => {
	await expect(_configuration("preview")).rejects.toThrow();
});
