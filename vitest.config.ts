import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		coverage: {
			// Application code is measured by each owning workspace's coverage gate.
			exclude: ["apps/**", "packages/**", "test/**"],
			provider: "v8",
			thresholds: {
				branches: 90,
				functions: 90,
				lines: 90,
				statements: 90,
			},
		},
		globals: true,
		include: ["test/**/*.spec.ts"],
	},
});
