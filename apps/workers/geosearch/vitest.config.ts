import { defineConfig } from "vitest/config";
import { WorkspaceCoverage } from "../../../vitest.shared";

export default defineConfig({
	test: {
		globals: true,
		include: ["src/**/*.spec.ts", "test/**/*.spec.ts"],
		coverage: {
			...WorkspaceCoverage,
			include: ["src/**/*.ts"],
			exclude: ["src/**/*.d.ts"],
		},
	},
});
