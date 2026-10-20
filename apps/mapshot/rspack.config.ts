import { resolve } from "node:path";
import type { Configuration } from "@rspack/core";

export function createMapshotBundleConfig(params: {
	name: string;
	entries: Record<string, string>;
	directory: string;
	externalPackages: boolean;
}): Configuration {
	return {
		name: params.name,
		context: process.cwd(),
		mode: "production",
		target: "node24",
		devtool: false,
		cache: false,
		entry: params.entries,
		output: {
			path: resolve(params.directory),
			filename: "[name].mjs",
			module: true,
			library: { type: "module" },
			chunkFormat: "module",
			asyncChunks: false,
		},
		resolve: { extensions: [".ts", ".js", ".json"] },
		node: { __dirname: false, __filename: false },
		module: {
			// Node resolves packaged assets and entrypoint checks relative to the emitted file.
			parser: { javascript: { importMeta: false, url: false } },
			rules: [
				{
					test: /\.ts$/,
					exclude: /node_modules/,
					loader: "builtin:swc-loader",
					options: {
						jsc: {
							parser: { syntax: "typescript", decorators: true },
							transform: { legacyDecorator: true, decoratorMetadata: true },
							target: "es2024",
						},
					},
				},
			],
		},
		externalsType: "module",
		externals: [
			({ request }, callback): void => {
				// Temporary fixture bundles resolve test dependencies from this workspace.
				const fixtureTestDouble = params.name === "fixture" && request === "testdouble";
				if (fixtureTestDouble) {
					callback(null, `module ${import.meta.resolve("testdouble")}`);
					return;
				}
				const packageImport = request !== undefined && !request.startsWith(".") && !request.startsWith("/");
				// Testdouble's Node replacement hooks need its original module paths.
				const nativeTestDependency = params.name === "native-test" && request === "testdouble";
				const externalPackage =
					params.externalPackages || request === "sharp" || request?.startsWith("node:") || nativeTestDependency;
				if (packageImport && externalPackage) {
					callback(null, `module ${request}`);
					return;
				}
				callback();
			},
		],
		optimization: { minimize: false, splitChunks: false },
	};
}

export default [
	createMapshotBundleConfig({
		name: "renderer",
		entries: { server: "./src/main.ts" },
		directory: "dist/native",
		externalPackages: true,
	}),
	createMapshotBundleConfig({
		name: "tools",
		entries: {
			"build-data": "./build/build-data.ts",
			"domain-data": "./build/data/mapshot-domain.tool.ts",
			"worldwide-extract.worker": "./build/data/references/worldwide/worldwide-extract.worker.ts",
		},
		directory: "dist/tools",
		externalPackages: true,
	}),
	createMapshotBundleConfig({
		name: "native-test",
		entries: { "engine.integration": "./test/native/engine.integration.ts" },
		directory: "dist/native-test",
		externalPackages: false,
	}),
];
