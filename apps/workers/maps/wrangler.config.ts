import { defineWranglerConfig } from "wrangler/experimental-config";

export default defineWranglerConfig({
	tsconfig: "./tsconfig.json",
	build: { command: "pnpm --filter @cataqui/maps-worker compile", watchDir: "src" },
	types: { generate: true, includeRuntime: false },
});
