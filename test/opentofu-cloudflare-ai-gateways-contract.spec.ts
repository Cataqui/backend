import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const repositoryRoot = process.cwd();
const infrastructureDirectory = resolve(repositoryRoot, "infrastructure");
const rootDirectory = resolve(infrastructureDirectory, "opentofu/roots/cloudflare-ai-gateways");

function _readInfrastructureFile(path: string): string {
	return readFileSync(resolve(infrastructureDirectory, path), "utf8");
}

function _getRootHcl(): string {
	return readdirSync(rootDirectory)
		.filter((fileName) => fileName.endsWith(".tf"))
		.sort()
		.map((fileName) => readFileSync(resolve(rootDirectory, fileName), "utf8"))
		.join("\n");
}

function _getApplicationConfiguration(): string {
	return [
		".env.example",
		"apps/api/src/core/config/env.validation.ts",
		"apps/api/src/modules/ai/ai.config.ts",
		"apps/api/src/platform/cloudflare/containers/api/api-container.ts",
		"apps/api/wrangler.jsonc",
	]
		.map((path) => readFileSync(resolve(repositoryRoot, path), "utf8"))
		.join("\n");
}

describe("cloudflare AI gateways OpenTofu contract", () => {
	it("should pin the approved OpenTofu and provider versions", () => {
		const versions = _readInfrastructureFile("opentofu/roots/cloudflare-ai-gateways/versions.tf");

		expect(versions.match(/version\s*=\s*"=[^"]+"/g)).toEqual([
			'version = "= 1.12.6"',
			'version = "= 5.23.0"',
			'version = "= 0.19.21"',
		]);
	});

	it("should pin the approved OpenTofu CLI version", () => {
		expect(_readInfrastructureFile(".opentofu-version").trim()).toBe("1.12.6");
	});

	it.each([
		["staging", "staging/cloudflare-ai-gateways/terraform.tfstate"],
		["production", "production/cloudflare-ai-gateways/terraform.tfstate"],
	] as const)("should isolate the %s backend key", (environment, expectedKey) => {
		const backend = _readInfrastructureFile(`opentofu/environments/${environment}/cloudflare-ai-gateways.s3.tfbackend`);

		expect(backend.trim()).toBe(`key = "${expectedKey}"`);
	});

	it("should keep backend credentials outside committed backend configuration", () => {
		const backends = [
			_readInfrastructureFile("opentofu/backends/r2.s3.tfbackend"),
			...["staging", "production"].map((environment) =>
				_readInfrastructureFile(`opentofu/environments/${environment}/cloudflare-ai-gateways.s3.tfbackend`),
			),
		].join("\n");

		expect(backends).not.toMatch(/(?:access_key|secret_key|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY)\s*=/);
	});

	it("should centralize R2 locking and compatibility without state backups", () => {
		const backend = _readInfrastructureFile("opentofu/backends/r2.s3.tfbackend");

		expect(backend).toMatch(
			/bucket\s*=\s*"cataqui-opentofu-state"[\s\S]*use_lockfile\s*=\s*true[\s\S]*use_path_style\s*=\s*true/,
		);
	});

	it("should centralize stable provider identifiers as committed non-secret configuration", () => {
		const platforms = JSON.parse(_readInfrastructureFile("platforms.json"));
		expect(platforms).toEqual({
			cloudflare: { account_id: "1fca946385505503c59dd6a2a4eeb442" },
			infisical: { project_id: "954d434f-7e08-4904-af66-0bf62377794e" },
		});

		const rootHcl = _getRootHcl();
		expect(rootHcl).toMatch(/jsondecode\(file\("\$\{path\.module\}\/\.\.\/\.\.\/\.\.\/platforms\.json"\)\)/);
		expect(rootHcl).toMatch(/account_id\s*=\s*local\.cloudflare_account_id/);
		expect(rootHcl).toMatch(/(?:project_id|workspace_id)\s*=\s*local\.infisical_project_id/);
		expect(rootHcl).not.toMatch(/(?:cloudflare_account_id|infisical_project_id)\s*=\s*"/);
	});

	it("should keep gateway credentials out of committed infrastructure values", () => {
		const committedValues = [_getRootHcl(), _readInfrastructureFile("platforms.json")].join("\n");

		expect(committedValues).not.toMatch(/(?:api_token|api_key|access_key|secret_access_key)\s*=\s*"[^"$]+"/i);
	});

	it("should write the runtime token only through Infisical's write-only field", () => {
		const rootHcl = _getRootHcl();

		expect(rootHcl).toMatch(
			/name\s*=\s*"DERIVE_JOB_DATA_AI_GATEWAY_API_TOKEN"[\s\S]*value_wo\s*=\s*cloudflare_api_token\.derive_job_data_runtime\.value[\s\S]*value_wo_version\s*=\s*1/,
		);
	});

	it("should prohibit secret outputs from the provider root", () => {
		expect(_getRootHcl()).not.toMatch(/\boutput\s+"/);
	});

	it("should prohibit the legacy generic AI gateway runtime contract", () => {
		expect(_getApplicationConfiguration()).not.toMatch(
			/(?:^|[^A-Z_])(?:CLOUDFLARE_AI_GATEWAY_ID|AI_GATEWAY_API_TOKEN)(?:[^A-Z_]|$)|\b(?:cloudflareAiGatewayId|aiApiToken)\b/m,
		);
	});

	it("should commit one derive-job-data gateway ID for each application environment", () => {
		const wrangler = readFileSync(resolve(repositoryRoot, "apps/api/wrangler.jsonc"), "utf8");

		expect(wrangler.match(/cataqui-derive-job-data-(?:development|staging|production)/g)).toEqual([
			"cataqui-derive-job-data-development",
			"cataqui-derive-job-data-staging",
			"cataqui-derive-job-data-production",
		]);
	});
});
