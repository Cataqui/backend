import { defineConfig } from "vitest/config";
import { WorkspaceCoverage } from "../../vitest.shared.ts";

export default defineConfig({
	resolve: { alias: { "cloudflare:workers": new URL("./test/worker-runtime.stub.ts", import.meta.url).pathname } },
	test: {
		include: ["src/**/*.spec.ts"],
		coverage: { ...WorkspaceCoverage, include: ["src/**/*.ts"], exclude: ["src/index.ts"] },
	},
});
