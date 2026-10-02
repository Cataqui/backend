import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

type MapsWorkerEnvironment = {
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

type MapsWorkerConfig = MapsWorkerEnvironment & {
	account_id?: string;
	main: string;
	env: Record<"production" | "staging", MapsWorkerEnvironment>;
};

const mapsWorkerConfig = ts.readConfigFile(resolve(process.cwd(), "wrangler.jsonc"), ts.sys.readFile)
	.config as MapsWorkerConfig;
const mapsEnvironmentSource = readFileSync(resolve(process.cwd(), "maps-worker-env.d.ts"), "utf8");
const packageScripts = (
	JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
		scripts: Record<string, string>;
	}
).scripts;

describe("Maps Worker configuration", () => {
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
			authContracts: packageManifest.dependencies["@cataqui/microservices-auth-schemas"],
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
			accountId: mapsWorkerConfig.account_id,
			main: mapsWorkerConfig.main,
			names: [mapsWorkerConfig.name, mapsWorkerConfig.env.staging.name, mapsWorkerConfig.env.production.name],
			stagingRoutes: mapsWorkerConfig.env.staging.routes,
			productionRoutes: mapsWorkerConfig.env.production.routes,
			workersDev: [
				mapsWorkerConfig.workers_dev,
				mapsWorkerConfig.env.staging.workers_dev,
				mapsWorkerConfig.env.production.workers_dev,
			],
		}).toEqual({
			accountId: "1fca946385505503c59dd6a2a4eeb442",
			main: "./src/app.ts",
			names: ["cataqui-maps-development", "cataqui-maps-staging", "cataqui-maps-production"],
			stagingRoutes: [{ pattern: "staging.maps.cataqui.com", custom_domain: true }],
			productionRoutes: [{ pattern: "maps.cataqui.com", custom_domain: true }],
			workersDev: [false, false, false],
		});
	});

	it("should configure isolated per-user rate limit bindings in every environment", () => {
		const expectedRateLimits = [
			{ name: "PLACE_SEARCH_RATE_LIMITER", namespace_id: "20001", simple: { limit: 30, period: 60 } },
			{ name: "PLACE_DETAILS_RATE_LIMITER", namespace_id: "20002", simple: { limit: 10, period: 60 } },
		];

		expect([
			mapsWorkerConfig.ratelimits,
			mapsWorkerConfig.env.staging.ratelimits,
			mapsWorkerConfig.env.production.ratelimits,
		]).toEqual([expectedRateLimits, expectedRateLimits, expectedRateLimits]);
	});

	it("should keep static delivery at the edge and enable structured logging", () => {
		expect({
			development: {
				placement: mapsWorkerConfig.placement,
				traces: mapsWorkerConfig.observability.traces,
			},
			staging: {
				placement: mapsWorkerConfig.env.staging.placement,
				traces: mapsWorkerConfig.env.staging.observability.traces,
			},
			production: {
				placement: mapsWorkerConfig.env.production.placement,
				traces: mapsWorkerConfig.env.production.observability.traces,
				invocationLogs: mapsWorkerConfig.env.production.observability.logs.invocation_logs,
			},
		}).toEqual({
			development: { placement: undefined, traces: undefined },
			staging: {
				placement: undefined,
				traces: undefined,
			},
			production: {
				placement: undefined,
				traces: undefined,
				invocationLogs: false,
			},
		});
	});

	it("should resolve public JWT verification keys from each environment's API and expose only the provider secrets", () => {
		const environments = [mapsWorkerConfig, mapsWorkerConfig.env.staging, mapsWorkerConfig.env.production];

		expect({
			jwksUrls: environments.map((environment) => environment.vars.MICROSERVICES_AUTH_JWKS_URL),
			requiredSecrets: environments.map((environment) => environment.secrets.required),
			generatedHasGoogleKey: mapsEnvironmentSource.includes("GOOGLE_PLACES_API_KEY"),
			generatedHasEmbeddedJwks: mapsEnvironmentSource.includes("MICROSERVICES_AUTH_JWKS_JSON"),
			generatedHasPrivateSigner: mapsEnvironmentSource.includes("MICROSERVICES_AUTH_JWT_PRIVATE_KEY_V1_PKCS8_BASE64"),
		}).toEqual({
			jwksUrls: [
				"http://localhost:3000/v1/auth/microservices/jwks",
				"https://staging.api.cataqui.com/v1/auth/microservices/jwks",
				"https://api.cataqui.com/v1/auth/microservices/jwks",
			],
			requiredSecrets: Array.from({ length: 3 }, () => ["GEOAPIFY_API_KEY", "GOOGLE_PLACES_API_KEY"]),
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
			development: 'wrangler dev --config wrangler.jsonc --env-file "$PWD/../../../.env" --local',
			stagingDeployment: "wrangler deploy --config wrangler.jsonc --env staging",
			productionDeployment: "wrangler deploy --config wrangler.jsonc --env production",
			secret: undefined,
			tail: undefined,
			types:
				'wrangler types maps-worker-env.d.ts --config wrangler.jsonc --env-interface MapsWorkerEnv --include-runtime false --env-file "$PWD/../../../.env.example"',
			typesCheck:
				'wrangler types maps-worker-env.d.ts --check --config wrangler.jsonc --env-interface MapsWorkerEnv --include-runtime false --env-file "$PWD/../../../.env.example"',
		});
	});
});
