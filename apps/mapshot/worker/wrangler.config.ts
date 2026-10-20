import { defineWranglerConfig } from "wrangler/experimental-config";

export default defineWranglerConfig({
	tsconfig: "./tsconfig.json",
	types: { generate: true, includeRuntime: false },
});
