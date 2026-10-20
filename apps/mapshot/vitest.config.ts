import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { WorkspaceCoverage } from "../../vitest.shared.ts";

export default defineConfig({
	oxc: { decorator: { legacy: true, emitDecoratorMetadata: true } },
	test: {
		maxWorkers: 4,
		testTimeout: 15_000,
		setupFiles: [fileURLToPath(import.meta.resolve("reflect-metadata"))],
		projects: [
			{
				extends: true,
				test: {
					name: "unit",
					globals: true,
					include: ["src/**/*.spec.ts", "scripts/**/*.spec.ts", "test/**/*.spec.ts"],
					exclude: ["test/**/*.runtime.spec.ts"],
				},
			},
			{
				extends: true,
				test: { name: "build", globals: true, include: ["build/**/*.spec.ts"] },
			},
		],
		coverage: {
			...WorkspaceCoverage,
			provider: "istanbul",
			include: ["src/**/*.ts", "scripts/**/*.ts", "build/**/*.ts"],
			exclude: ["src/**/*.d.ts"],
			thresholds: {
				...WorkspaceCoverage.thresholds,
				"build/**/*.ts": { statements: 90, branches: 90, functions: 90, lines: 90 },
			},
		},
	},
});
