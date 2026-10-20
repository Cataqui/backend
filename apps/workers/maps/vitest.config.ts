import { defineConfig } from "vitest/config";
import { WorkspaceCoverage } from "../../../vitest.shared.ts";
export default defineConfig({
	oxc: { decorator: { legacy: true, emitDecoratorMetadata: true } },
	test: {
		projects: [
			{
				extends: true,
				resolve: {
					alias: [
						{ find: /^#maps\/(.+)$/, replacement: new URL("./src/$1.ts", import.meta.url).pathname },
						{
							find: "cloudflare:workers",
							replacement: new URL("./test/cloudflare-workers.stub.ts", import.meta.url).pathname,
						},
					],
				},
				test: {
					name: "unit",
					globals: true,
					setupFiles: [new URL("./node_modules/reflect-metadata/Reflect.js", import.meta.url).pathname],
					include: ["src/**/*.spec.ts", "test/configuration-contract.spec.ts", "test/worker-binding-types.spec.ts"],
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
