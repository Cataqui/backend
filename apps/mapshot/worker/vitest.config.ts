import { defineConfig } from "vitest/config";
import { WorkspaceCoverage } from "../../../vitest.shared.ts";
export default defineConfig({
	test: {
		maxWorkers: 4,
		testTimeout: 15000,
		name: "unit",
		globals: true,
		include: ["src/**/*.spec.ts", "test/**/*.spec.ts"],
		coverage: { ...WorkspaceCoverage, provider: "istanbul", include: ["src/**/*.ts"], exclude: ["src/**/*.d.ts"] },
	},
	resolve: {
		alias: {
			"cloudflare:workers": new URL("./test/cloudflare-workers.stub.ts", import.meta.url).pathname,
			"@cataqui/workerhole/worker": new URL("./test/worker-portal.stub.ts", import.meta.url).pathname,
		},
	},
});
