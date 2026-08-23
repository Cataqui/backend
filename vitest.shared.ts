import type { CoverageOptions } from "vitest/node";

export const WorkspaceCoverage = {
	provider: "v8",
	thresholds: {
		branches: 90,
		functions: 90,
		lines: 90,
		statements: 90,
	},
} as const satisfies CoverageOptions;
