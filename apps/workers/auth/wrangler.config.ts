import { defineWranglerConfig } from "wrangler/experimental-config";

export default defineWranglerConfig({
	tsconfig: "./tsconfig.json",
	build: { command: "pnpm --filter @cataqui/auth-worker compile", watchDir: "src" },
	dev: { ip: "127.0.0.1" },
	types: { generate: true, includeRuntime: false },
});
