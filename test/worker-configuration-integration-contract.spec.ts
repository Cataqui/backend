import { globSync } from "node:fs";
import { resolve } from "node:path";
import { loadCloudflareConfiguration } from "./cloudflare-configuration";

describe("native Cloudflare configuration integration", () => {
	beforeEach(() => vi.stubEnv("HYPERDRIVE_ID", "a".repeat(32)));
	afterEach(() => vi.unstubAllEnvs());

	it.each(["development", "staging", "production"] as const)(
		"connects independent applications through private bindings in %s",
		async (mode) => {
			const [api, auth, maps, mapshot] = await Promise.all([
				loadCloudflareConfiguration({ application: "apps/api/worker", mode: mode }),
				loadCloudflareConfiguration({ application: "apps/workers/auth", mode: mode }),
				loadCloudflareConfiguration({ application: "apps/workers/maps", mode: mode }),
				loadCloudflareConfiguration({ application: "apps/mapshot/worker", mode: mode }),
			]);
			expect([api.accountId, auth.accountId, maps.accountId, mapshot.accountId]).toEqual(
				Array(4).fill("1fca946385505503c59dd6a2a4eeb442"),
			);
			expect(api.worker?.entrypoint).toBe(resolve("apps/api/worker/src/worker.ts"));
			expect(auth.worker?.entrypoint).toBe(resolve("apps/workers/auth/src/app.ts"));
			for (const caller of [api, maps]) {
				expect(caller.worker?.env?.AUTH).toMatchObject({
					type: "worker",
					worker: auth.worker?.name,
					exportName: "AuthEntrypoint",
				});
				for (const name of [
					"META_APP_SECRET",
					"AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL",
					"WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN",
					"WHATSAPP_NOTP_PHONE_NUMBER_ID",
					"WHATSAPP_NOTP_RECEIVER",
				]) {
					expect(caller.worker?.env).not.toHaveProperty(name);
				}
			}
			expect(api.worker?.env?.MAPS).toMatchObject({ type: "worker", worker: maps.worker?.name });
			expect(maps.worker?.env?.MAPSHOT).toMatchObject({ type: "worker", worker: mapshot.worker?.name });
			expect(Object.values(auth.worker?.env ?? {}).some((binding) => binding.type === "worker")).toBe(false);
			expect(auth.worker?.env?.DB).toMatchObject({ type: "hyperdrive" });
			for (const name of [
				"META_APP_SECRET",
				"AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL",
				"WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN",
				"UPSTASH_REDIS_REST_URL",
				"UPSTASH_REDIS_REST_TOKEN",
			]) {
				expect(auth.worker?.env?.[name]).toEqual({ type: "secret" });
			}
			expect(api.worker?.cache).toEqual({ enabled: false, crossVersionCache: false });
			expect(api.containers?.[0]).toMatchObject({ maxInstances: 1, constraints: { regions: ["SAM"] } });
			expect(mapshot.worker?.compatibilityFlags).toContain("enable_request_signal");
			expect(JSON.stringify(auth.worker?.triggers)).not.toContain("verify-whatsapp-notp");
		},
	);

	it.each(["staging", "production"] as const)("disables workers.dev endpoints in %s", async (mode) => {
		for (const application of ["apps/api/worker", "apps/workers/auth", "apps/workers/maps", "apps/mapshot/worker"]) {
			const configuration = await loadCloudflareConfiguration({ application: application, mode: mode });
			expect(configuration.worker?.workersDev).toBe(false);
			if (mode === "production") {
				expect(configuration.worker?.observability?.logs).toMatchObject({ headSamplingRate: 1, invocationLogs: false });
			}
		}
	});

	it.each(["staging", "production"] as const)(
		"resolves caller bindings without Auth deployment credentials in %s",
		async (mode) => {
			vi.stubEnv("HYPERDRIVE_ID", undefined);
			for (const application of ["apps/api/worker", "apps/workers/maps"]) {
				const configuration = await loadCloudflareConfiguration({ application: application, mode: mode });
				expect(configuration.worker?.env?.AUTH).toMatchObject({ worker: `cataqui-auth-${mode}` });
			}
		},
	);

	it("keeps maintained runtime configuration exclusively in native config files", () => {
		expect(
			globSync("{apps,packages}/**/wrangler.{json,jsonc,toml}", {
				exclude: ["**/node_modules/**", "**/dist/**", "**/.cloudflare/**", "**/.wrangler/**", "**/target/**"],
			}),
		).toEqual([]);
	});
});
