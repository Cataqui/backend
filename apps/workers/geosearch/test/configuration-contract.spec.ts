import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

type GeosearchWorkerEnvironment = {
	name: string;
	workers_dev?: boolean;
	placement?: { mode: "off" | "smart" };
	routes?: Array<{ custom_domain: boolean; pattern: string }>;
	vars: { ENVIRONMENT: string; MICROSERVICES_AUTH_JWKS_URL: string };
	ratelimits: Array<{ name: string; namespace_id: string; simple: { limit: number; period: number } }>;
	secrets: { required: string[] };
	observability: {
		enabled: boolean;
		logs: { enabled: boolean; head_sampling_rate: number; invocation_logs?: boolean };
		traces?: { enabled: boolean; head_sampling_rate: number };
	};
};

type GeosearchWorkerConfig = GeosearchWorkerEnvironment & {
	account_id?: string;
	main: string;
	env: Record<"production" | "staging", GeosearchWorkerEnvironment>;
};

const geosearchWorkerConfig = ts.readConfigFile(resolve(process.cwd(), "wrangler.jsonc"), ts.sys.readFile)
	.config as GeosearchWorkerConfig;
const geosearchEnvironmentSource = readFileSync(resolve(process.cwd(), "geosearch-worker-env.d.ts"), "utf8");
const packageScripts = (
	JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
		scripts: Record<string, string>;
	}
).scripts;

describe("Geosearch Worker configuration", () => {
	it("should expose an independent lifecycle and shared auth-contract dependency", () => {
		const packageManifest = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
			dependencies: Record<string, string>;
		};

		expect({
			build: packageScripts["build"],
			clean: packageScripts["clean"],
			test: packageScripts["test"],
			testCoverage: packageScripts["test:cov"],
			typecheck: packageScripts["typecheck"],
			authContracts: packageManifest.dependencies["@cataqui/microservices-auth-contracts"],
		}).toEqual({
			build: "wrangler deploy --dry-run --config wrangler.jsonc --outdir dist",
			clean:
				"node -e \"for (const target of ['coverage','dist']) require('node:fs').rmSync(target,{recursive:true,force:true})\"",
			test: "vitest run",
			testCoverage: "vitest run --coverage",
			typecheck: "tsc --noEmit && pnpm cf:types:check",
			authContracts: "workspace:*",
		});
	});

	it("should expose independent Worker names and the exact protected custom domains", () => {
		expect({
			accountId: geosearchWorkerConfig.account_id,
			main: geosearchWorkerConfig.main,
			names: [
				geosearchWorkerConfig.name,
				geosearchWorkerConfig.env.staging.name,
				geosearchWorkerConfig.env.production.name,
			],
			stagingRoutes: geosearchWorkerConfig.env.staging.routes,
			productionRoutes: geosearchWorkerConfig.env.production.routes,
			workersDev: [
				geosearchWorkerConfig.workers_dev,
				geosearchWorkerConfig.env.staging.workers_dev,
				geosearchWorkerConfig.env.production.workers_dev,
			],
		}).toEqual({
			accountId: "1fca946385505503c59dd6a2a4eeb442",
			main: "./src/app.ts",
			names: ["cataqui-geosearch-development", "cataqui-geosearch-staging", "cataqui-geosearch-production"],
			stagingRoutes: [{ pattern: "staging.geosearch.cataqui.com", custom_domain: true }],
			productionRoutes: [{ pattern: "geosearch.cataqui.com", custom_domain: true }],
			workersDev: [true, false, false],
		});
	});

	it("should configure isolated per-user rate limit bindings in every environment", () => {
		const expectedRateLimits = [
			{ name: "ADDRESS_SEARCH_RATE_LIMITER", namespace_id: "20001", simple: { limit: 30, period: 60 } },
			{ name: "ADDRESS_DETAILS_RATE_LIMITER", namespace_id: "20002", simple: { limit: 10, period: 60 } },
		];

		expect([
			geosearchWorkerConfig.ratelimits,
			geosearchWorkerConfig.env.staging.ratelimits,
			geosearchWorkerConfig.env.production.ratelimits,
		]).toEqual([expectedRateLimits, expectedRateLimits, expectedRateLimits]);
	});

	it("should smart-place hosted environments and trace them at environment-specific sampling rates", () => {
		expect({
			development: {
				placement: geosearchWorkerConfig.placement,
				traces: geosearchWorkerConfig.observability.traces,
			},
			staging: {
				placement: geosearchWorkerConfig.env.staging.placement,
				traces: geosearchWorkerConfig.env.staging.observability.traces,
			},
			production: {
				placement: geosearchWorkerConfig.env.production.placement,
				traces: geosearchWorkerConfig.env.production.observability.traces,
				invocationLogs: geosearchWorkerConfig.env.production.observability.logs.invocation_logs,
			},
		}).toEqual({
			development: { placement: undefined, traces: undefined },
			staging: {
				placement: { mode: "smart" },
				traces: { enabled: true, head_sampling_rate: 1 },
			},
			production: {
				placement: { mode: "smart" },
				traces: { enabled: true, head_sampling_rate: 0.1 },
				invocationLogs: false,
			},
		});
	});

	it("should resolve public JWT verification keys from each environment's API and expose only the Google secret", () => {
		const environments = [
			geosearchWorkerConfig,
			geosearchWorkerConfig.env.staging,
			geosearchWorkerConfig.env.production,
		];

		expect({
			jwksUrls: environments.map((environment) => environment.vars.MICROSERVICES_AUTH_JWKS_URL),
			requiredSecrets: environments.map((environment) => environment.secrets.required),
			generatedHasGoogleKey: geosearchEnvironmentSource.includes("GOOGLE_PLACES_API_KEY"),
			generatedHasEmbeddedJwks: geosearchEnvironmentSource.includes("MICROSERVICES_AUTH_JWKS_JSON"),
			generatedHasPrivateSigner: geosearchEnvironmentSource.includes(
				"MICROSERVICES_AUTH_JWT_PRIVATE_KEY_V1_PKCS8_BASE64",
			),
		}).toEqual({
			jwksUrls: [
				"http://localhost:3000/v1/auth/microservices/jwks",
				"https://staging.api.cataqui.com/v1/auth/microservices/jwks",
				"https://api.cataqui.com/v1/auth/microservices/jwks",
			],
			requiredSecrets: [["GOOGLE_PLACES_API_KEY"], ["GOOGLE_PLACES_API_KEY"], ["GOOGLE_PLACES_API_KEY"]],
			generatedHasGoogleKey: true,
			generatedHasEmbeddedJwks: false,
			generatedHasPrivateSigner: false,
		});
	});

	it("should expose development, deployment, type-generation, and tail scripts", () => {
		expect({
			development: packageScripts["cf:dev"],
			stagingDeployment: packageScripts["cf:deploy:staging"],
			productionDeployment: packageScripts["cf:deploy:production"],
			secret: packageScripts["cf:secret:put"],
			tail: packageScripts["cf:tail"],
			types: packageScripts["cf:types"],
			typesCheck: packageScripts["cf:types:check"],
		}).toEqual({
			development: 'wrangler dev --config wrangler.jsonc --env-file "$PWD/../../../.env"',
			stagingDeployment: "wrangler deploy --config wrangler.jsonc --env staging",
			productionDeployment: "wrangler deploy --config wrangler.jsonc --env production",
			secret: "wrangler secret put --config wrangler.jsonc",
			tail: "wrangler tail --config wrangler.jsonc",
			types:
				'wrangler types geosearch-worker-env.d.ts --config wrangler.jsonc --env-interface GeosearchWorkerEnv --include-runtime false --env-file "$PWD/../../../.env.example"',
			typesCheck:
				'wrangler types geosearch-worker-env.d.ts --check --config wrangler.jsonc --env-interface GeosearchWorkerEnv --include-runtime false --env-file "$PWD/../../../.env.example"',
		});
	});
});
