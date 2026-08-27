import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("observability runtime source-map contract", () => {
	it("should enable source maps for every local and deployed Node start command", () => {
		const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
			scripts: Record<string, string>;
		};

		expect(
			["start", "start:dev", "start:debug", "start:prod"].map((scriptName) => ({
				enablesSourceMaps: packageJson.scripts[scriptName]?.includes("node --enable-source-maps") ?? false,
				scriptName: scriptName,
			})),
		).toEqual([
			{ enablesSourceMaps: true, scriptName: "start" },
			{ enablesSourceMaps: true, scriptName: "start:dev" },
			{ enablesSourceMaps: true, scriptName: "start:debug" },
			{ enablesSourceMaps: true, scriptName: "start:prod" },
		]);
	});

	it("should enable source maps in the production container command", () => {
		const dockerfile = readFileSync(resolve(process.cwd(), "Dockerfile"), "utf8");

		expect(dockerfile).toContain(
			'CMD ["node", "--enable-source-maps", "--import", "./register-opentelemetry-instrumentation.mjs", "dist/src/main.js"]',
		);
	});

	it("should preload the instrumentation registration module for every Node start command", () => {
		const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
			scripts: Record<string, string>;
		};

		expect(
			["start", "start:dev", "start:debug", "start:prod"].map((scriptName) => ({
				preloadsInstrumentationRegistration:
					packageJson.scripts[scriptName]?.includes("--import ./register-opentelemetry-instrumentation.mjs") ?? false,
				scriptName: scriptName,
			})),
		).toEqual([
			{ preloadsInstrumentationRegistration: true, scriptName: "start" },
			{ preloadsInstrumentationRegistration: true, scriptName: "start:dev" },
			{ preloadsInstrumentationRegistration: true, scriptName: "start:debug" },
			{ preloadsInstrumentationRegistration: true, scriptName: "start:prod" },
		]);
	});

	it("should register the supported instrumentation hook while excluding every owned runtime code root", () => {
		const instrumentationRegistration = readFileSync(
			resolve(process.cwd(), "register-opentelemetry-instrumentation.mjs"),
			"utf8",
		);

		expect({
			excludedRuntimeRoots: ["./src/", "./dist/src/", "./generated/"].map((runtimeRoot) => ({
				excluded: instrumentationRegistration.includes(`new URL("${runtimeRoot}", import.meta.url)`),
				runtimeRoot: runtimeRoot,
			})),
			registersSupportedHook: instrumentationRegistration.includes(
				'register("@opentelemetry/instrumentation/hook.mjs", import.meta.url,',
			),
			usesDeprecatedExperimentalLoader: instrumentationRegistration.includes("--experimental-loader"),
		}).toEqual({
			excludedRuntimeRoots: [
				{ excluded: true, runtimeRoot: "./src/" },
				{ excluded: true, runtimeRoot: "./dist/src/" },
				{ excluded: true, runtimeRoot: "./generated/" },
			],
			registersSupportedHook: true,
			usesDeprecatedExperimentalLoader: false,
		});
	});
});
