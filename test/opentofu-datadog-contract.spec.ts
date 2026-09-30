import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();
const infrastructureDirectory = resolve(repositoryRoot, "infrastructure");
const rootDirectory = resolve(infrastructureDirectory, "opentofu/roots/datadog-api-keys");

function _readRepositoryFile(path: string): string {
	return readFileSync(resolve(repositoryRoot, path), "utf8");
}

function _getRootHcl(): string {
	return readdirSync(rootDirectory)
		.filter((fileName) => fileName.endsWith(".tf"))
		.sort()
		.map((fileName) => readFileSync(resolve(rootDirectory, fileName), "utf8"))
		.join("\n");
}

describe("Datadog OpenTofu contract", () => {
	it("should pin the Datadog provider version", () => {
		const versions = _readRepositoryFile("infrastructure/opentofu/roots/datadog-api-keys/versions.tf");

		expect(versions).toMatch(/source\s*=\s*"DataDog\/datadog"\s*\n\s*version\s*=\s*"= 4\.23\.0"/);
	});

	it("should lock the pinned Datadog provider", () => {
		const lockfile = _readRepositoryFile("infrastructure/opentofu/roots/datadog-api-keys/.terraform.lock.hcl");

		expect(lockfile).toMatch(/provider "registry\.opentofu\.org\/datadog\/datadog"[\s\S]*version\s*=\s*"4\.23\.0"/);
	});

	it.each([
		["staging", 'key = "staging/datadog-api-keys/terraform.tfstate"'],
		["production", 'key = "production/datadog-api-keys/terraform.tfstate"'],
	] as const)("should isolate the %s state", (environment, expectedBackend) => {
		const backend = _readRepositoryFile(
			`infrastructure/opentofu/environments/${environment}/datadog-api-keys.s3.tfbackend`,
		);

		expect(backend.trim()).toBe(expectedBackend);
	});

	it("should talk to the Datadog site the organization lives on", () => {
		const platforms = JSON.parse(_readRepositoryFile("infrastructure/platforms.json"));

		expect(platforms.datadog).toEqual({ site: "us5.datadoghq.com" });
	});

	it("should send telemetry to the Cloudflare OTLP endpoint of the same Datadog site", () => {
		const wrangler = _readRepositoryFile("apps/api/wrangler.jsonc");

		expect(
			wrangler.match(/"DATADOG_OTLP_ENDPOINT": "https:\/\/cloudflare\.integrations\.otlp\.us5\.datadoghq\.com"/g),
		).toHaveLength(3);
	});

	it("should name one key per environment from the manifest", () => {
		const manifest = JSON.parse(_readRepositoryFile("infrastructure/manifest.json"));

		expect(manifest.datadog.api_keys).toEqual({
			cataqui_api_staging: { name: "cataqui-api-staging" },
			cataqui_api_production: { name: "cataqui-api-production" },
		});
	});

	it("should publish the key only through a write-only Infisical field in the API runtime folder", () => {
		const rootHcl = _getRootHcl();

		expect(rootHcl).toMatch(
			/name\s*=\s*"DATADOG_API_KEY"\s*\n\s*value_wo\s*=\s*datadog_api_key\.api_runtime\.key\s*\n\s*value_wo_version = 1/,
		);
	});

	it("should never expose the key through outputs or plain values", () => {
		expect(_getRootHcl()).not.toMatch(/\boutput\s+"|\n\s*value\s*=/);
	});

	it("should leave Datadog provider authentication to the DD_API_KEY and DD_APP_KEY environment", () => {
		expect(_getRootHcl()).not.toMatch(/\b(?:api_key|app_key)\s*=/);
	});

	it("should deliver the key the API container expects", () => {
		const applicationConfiguration = [
			_readRepositoryFile("apps/api/wrangler.jsonc"),
			_readRepositoryFile("apps/api/src/platform/cloudflare/containers/api/api-container.ts"),
			_readRepositoryFile(".github/actions/deploy-api/action.yml"),
		].join("\n");

		expect(applicationConfiguration.match(/DATADOG_API_KEY/g)?.length).toBeGreaterThanOrEqual(5);
	});

	it.each(["datadog-api-keys", "datadog-observability"])("should apply the %s root on every deploy", (rootName) => {
		const deployWorkflow = _readRepositoryFile(".github/workflows/deploy.yml");

		expect(deployWorkflow).toContain(`uses: ./.github/actions/${rootName}`);
	});

	it.each([
		["staging", 'key = "staging/datadog-observability/terraform.tfstate"'],
		["production", 'key = "production/datadog-observability/terraform.tfstate"'],
	] as const)("should isolate the %s observability state", (environment, expectedBackend) => {
		const backend = _readRepositoryFile(
			`infrastructure/opentofu/environments/${environment}/datadog-observability.s3.tfbackend`,
		);

		expect(backend.trim()).toBe(expectedBackend);
	});

	it("should lock the pinned Datadog provider for the observability root", () => {
		const lockfile = _readRepositoryFile("infrastructure/opentofu/roots/datadog-observability/.terraform.lock.hcl");

		expect(lockfile).toMatch(/provider "registry\.opentofu\.org\/datadog\/datadog"[\s\S]*version\s*=\s*"4\.23\.0"/);
	});
});
