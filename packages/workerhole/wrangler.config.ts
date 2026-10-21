import { defineWranglerConfig } from "wrangler/experimental-config";

export default defineWranglerConfig({
	tsconfig: "./tsconfig.runtime.json",
	types: { generate: true, includeRuntime: false },
	dev: { inspectorPort: 0 },
});
