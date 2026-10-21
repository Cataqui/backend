import { defineConfig } from "vitest/config";
import { WorkspaceCoverage } from "../../../vitest.shared.ts";
export default defineConfig({
	resolve: {
		alias: {
			"cloudflare:workers": new URL("./test/cloudflare-workers.stub.ts", import.meta.url).pathname,
			"@cataqui/workerhole/worker": new URL("../../../packages/workerhole/dist/worker.js", import.meta.url).pathname,
		},
	},
	test: {
		globals: true,
		include: ["src/**/*.spec.ts", "test/**/*.spec.ts"],
		coverage: { ...WorkspaceCoverage, include: ["src/**/*.ts"] },
	},
});
