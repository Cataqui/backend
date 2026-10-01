import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
import { WorkspaceCoverage } from "../../../vitest.shared";

export default defineConfig({
	test: {
		projects: [
			{
				extends: true,
				resolve: {
					alias: [
						{
							find: "cloudflare:workers",
							replacement: new URL("./test/cloudflare-workers.stub.ts", import.meta.url).pathname,
						},
						{ find: /^.*\.(wasm|ttf)$/, replacement: new URL("./test/binary-asset.stub.ts", import.meta.url).pathname },
					],
				},
				test: { name: "unit", globals: true, include: ["src/**/*.spec.ts"] },
			},
			{
				extends: true,
				plugins: [
					cloudflareTest({
						wrangler: { configPath: "./wrangler.jsonc", environment: "staging" },
						miniflare: { bindings: { GEOAPIFY_API_KEY: "runtime-test-key" } },
					}),
				],
				test: {
					name: "runtime",
					globals: true,
					include: [
						"test/runtime.spec.ts",
						"test/entrypoint.runtime.spec.ts",
						"test/landmark-compositor.runtime.spec.ts",
					],
				},
			},
		],
		coverage: {
			...WorkspaceCoverage,
			provider: "istanbul",
			include: ["src/**/*.ts"],
			exclude: ["src/**/*.d.ts"],
		},
	},
});
