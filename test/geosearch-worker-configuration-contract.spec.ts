import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

type GeosearchWorkerEnvironment = {
	name: string;
	workers_dev?: boolean;
	routes?: Array<{ custom_domain: boolean; pattern: string }>;
	vars: { ENVIRONMENT: string; MICROSERVICES_AUTH_JWKS_URL: string };
	ratelimits: Array<{ name: string; namespace_id: string; simple: { limit: number; period: number } }>;
	secrets: { required: string[] };
	observability: { logs: { enabled: boolean; head_sampling_rate: number; invocation_logs?: boolean } };
};

type GeosearchWorkerConfig = GeosearchWorkerEnvironment & {
	account_id: string;
	main: string;
	env: Record<"production" | "staging", GeosearchWorkerEnvironment>;
};

const geosearchWorkerConfig = ts.readConfigFile(
	resolve(process.cwd(), "src/platform/cloudflare/workers/geosearch/wrangler.jsonc"),
	ts.sys.readFile,
).config as GeosearchWorkerConfig;
const geosearchEnvironmentSource = readFileSync(
	resolve(process.cwd(), "src/platform/cloudflare/workers/geosearch/geosearch-worker-env.d.ts"),
	"utf8",
);
const deploymentActionSource = readFileSync(
	resolve(process.cwd(), ".github/actions/deploy-cloudflare-geosearch-worker/action.yml"),
	"utf8",
);
const deploymentWorkflowSources = ["deploy-staging.yml", "deploy-production.yml"].map((fileName) =>
	readFileSync(resolve(process.cwd(), ".github/workflows", fileName), "utf8"),
);
const packageScripts = (
	JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
		scripts: Record<string, string>;
	}
).scripts;

describe("Geosearch Worker configuration", () => {
	it("should compose explicit per-Worker type operations through aggregate scripts", () => {
		expect({
			typecheck: packageScripts["cf:typecheck"],
			types: packageScripts["cf:types"],
			typesCheck: packageScripts["cf:types:check"],
		}).toEqual({
			typecheck: "pnpm cf:typecheck:api && pnpm cf:typecheck:geosearch && pnpm cf:typecheck:webhooks",
			types: "pnpm cf:types:api && pnpm cf:types:geosearch && pnpm cf:types:webhooks",
			typesCheck: "pnpm cf:types:api:check && pnpm cf:types:geosearch:check && pnpm cf:types:webhooks:check",
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
			main: "./app.ts",
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

	it("should deploy through an isolated strict action with readiness and rollback", () => {
		expect({
			workflowsUseAction: deploymentWorkflowSources.every((source) =>
				source.includes("uses: ./.github/actions/deploy-cloudflare-geosearch-worker"),
			),
			productionDomain:
				deploymentWorkflowSources.at(1)?.includes("readiness-url: https://geosearch.cataqui.com/v1/health") ?? false,
			strictDeploy: deploymentActionSource.includes(
				"deploy --strict --cwd src/platform/cloudflare/workers/geosearch --config wrangler.jsonc",
			),
			isolatedSecretFile:
				deploymentActionSource.includes("umask 077") &&
				deploymentActionSource.includes("GOOGLE_PLACES_API_KEY: env.GOOGLE_PLACES_API_KEY") &&
				deploymentActionSource.includes('run: rm -f -- "$SECRETS_FILE"'),
			readiness: deploymentActionSource.includes('response_status" == "204"'),
			rollback:
				deploymentActionSource.includes("steps.readiness.outcome == 'failure'") &&
				deploymentActionSource.includes("rollback --cwd src/platform/cloudflare/workers/geosearch"),
			forwardsAccountId:
				deploymentActionSource.includes("cloudflare-account-id") || deploymentActionSource.includes("accountId:"),
		}).toEqual({
			workflowsUseAction: true,
			productionDomain: true,
			strictDeploy: true,
			isolatedSecretFile: true,
			readiness: true,
			rollback: true,
			forwardsAccountId: false,
		});
	});

	it("should expose development, deployment, type-generation, and tail scripts", () => {
		expect({
			aggregateTypecheck: packageScripts["typecheck"],
			workerTypecheck: packageScripts["cf:typecheck:geosearch"],
			development: packageScripts["cf:dev:geosearch"],
			stagingDeployment: packageScripts["cf:deploy:geosearch:staging"],
			productionDeployment: packageScripts["cf:deploy:geosearch:production"],
			secret: packageScripts["cf:secret:put:geosearch"],
			tail: packageScripts["cf:tail:geosearch"],
			types: packageScripts["cf:types:geosearch"],
			typesCheck: packageScripts["cf:types:geosearch:check"],
		}).toEqual({
			aggregateTypecheck: "tsc --noEmit && pnpm cf:typecheck && pnpm cf:types:check",
			workerTypecheck: "tsc --noEmit -p src/platform/cloudflare/workers/geosearch/tsconfig.json",
			development:
				'wrangler dev --cwd src/platform/cloudflare/workers/geosearch --config wrangler.jsonc --env-file "$PWD/.env"',
			stagingDeployment:
				"wrangler deploy --cwd src/platform/cloudflare/workers/geosearch --config wrangler.jsonc --env staging",
			productionDeployment:
				"wrangler deploy --cwd src/platform/cloudflare/workers/geosearch --config wrangler.jsonc --env production",
			secret: "wrangler secret put --cwd src/platform/cloudflare/workers/geosearch --config wrangler.jsonc",
			tail: "wrangler tail --cwd src/platform/cloudflare/workers/geosearch --config wrangler.jsonc",
			types:
				'wrangler types geosearch-worker-env.d.ts --cwd src/platform/cloudflare/workers/geosearch --config wrangler.jsonc --env-interface GeosearchWorkerEnv --include-runtime false --env-file "$PWD/.env.example"',
			typesCheck:
				'wrangler types geosearch-worker-env.d.ts --check --cwd src/platform/cloudflare/workers/geosearch --config wrangler.jsonc --env-interface GeosearchWorkerEnv --include-runtime false --env-file "$PWD/.env.example"',
		});
	});
});
