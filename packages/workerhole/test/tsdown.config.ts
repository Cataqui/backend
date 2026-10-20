import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["fixture-node.ts"],
	format: "esm",
	outDir: "dist",
	platform: "node",
	deps: { alwaysBundle: [/@cataqui\/workerhole/, "capnweb", "ws"] },
});
