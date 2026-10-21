import { defineConfig } from "vitest/config";
import { WorkspaceCoverage } from "../../../vitest.shared.ts";
export default defineConfig({
	oxc: { decorator: { legacy: true, emitDecoratorMetadata: true } },
	resolve: {
		alias: [
			{ find: /^#auth\/(.+)$/, replacement: new URL("./src/$1.ts", import.meta.url).pathname },
			{
				find: "cloudflare:workers",
				replacement: new URL("./test/cloudflare-workers.stub.ts", import.meta.url).pathname,
			},
		],
	},
	test: {
		globals: true,
		setupFiles: [new URL("./node_modules/reflect-metadata/Reflect.js", import.meta.url).pathname],
		include: ["src/**/*.spec.ts", "test/**/*.spec.ts"],
		coverage: {
			...WorkspaceCoverage,
			include: ["src/**/*.ts", "cloudflare.config.ts"],
			exclude: ["src/**/*.d.ts", "src/generated/**"],
		},
	},
});
