import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
	test: {
		globals: true,
		include: ["src/**/*.spec.ts", "test/**/*.spec.ts"],
		env: {
			NODE_ENV: "test",
			DATABASE_POOLER_URL: "postgresql://test:test@localhost:5432/test?schema=public",
			DATABASE_DIRECT_URL: "postgresql://test:test@localhost:5432/test?schema=public",
			CORS_ORIGINS: "http://localhost:3000",
			PROTOMAP_AUTH_SECRET: "test-secret",
			PROTOMAP_URL: "https://tiles.cataqui.com",
		},
		coverage: {
			provider: "v8",
			include: ["src/**/*.ts"],
			exclude: ["src/main.ts", "src/app.module.ts", "src/**/index.ts", "src/**/*.module.ts"],
			thresholds: {
				lines: 90,
				functions: 90,
				branches: 90,
				statements: 90,
			},
		},
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "src"),
		},
	},
});