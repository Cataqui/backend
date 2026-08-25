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

		expect(versions.match(/version\s*=\s*"=[^"]+"/g)).toEqual(['version = "= 1.12.6"', 'version = "= 5.23.0"']);
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
			cloudflare: {
				account_id: "1fca946385505503c59dd6a2a4eeb442",
				zones: {
					"cataqui.com": {
						zone_id: "0c75bfd5c20cdbb338d44e62bcde8acc",
					},
				},
			},
			google_cloud: {
				organization_id: "945579294313",
				billing_account_id: "01A827-CA7CE9-646496",
			},
			infisical: {
				project_id: "954d434f-7e08-4904-af66-0bf62377794e",
				project_slug: "cataqui-backend-r6c-i",
			},
			neon: {
				organization_id: "org-wandering-pond-46567045",
				database: { name: "cataqui", owner_role: "db_owner", runtime_role: "db_user" },
			},
		});

		const rootHcl = _getRootHcl();
		expect(rootHcl).toMatch(/jsondecode\(file\("\$\{path\.module\}\/\.\.\/\.\.\/\.\.\/platforms\.json"\)\)/);
		expect(rootHcl).toMatch(/account_id\s*=\s*local\.cloudflare_account_id/);
		expect(rootHcl).not.toMatch(/(?:cloudflare_account_id|infisical_project_id)\s*=\s*"/);
	});

	it("should keep gateway credentials out of committed infrastructure values", () => {
		const committedValues = [_getRootHcl(), _readInfrastructureFile("platforms.json")].join("\n");

		expect(committedValues).not.toMatch(/(?:api_token|api_key|access_key|secret_access_key)\s*=\s*"[^"$]+"/i);
	});

	it("should leave token issuance and delivery to the centralized token root", () => {
		const rootHcl = _getRootHcl();

		expect(rootHcl).not.toMatch(/cloudflare_api_token|cloudflare_api_token_permission_groups|infisical_/);
	});

	it("should prohibit secret outputs from the provider root", () => {
		expect(_getRootHcl()).not.toMatch(/\boutput\s+"/);
	});

	it("should use an API-owned token with task-specific gateway IDs", () => {
		const applicationConfiguration = _getApplicationConfiguration();

		expect(applicationConfiguration).toContain("AI_GATEWAY_API_TOKEN");
		expect(applicationConfiguration).toContain("aiGatewayApiToken");
		expect(applicationConfiguration).not.toMatch(
			/(?:^|[^A-Z_])(?:CLOUDFLARE_AI_GATEWAY_ID|DERIVE_JOB_DATA_AI_GATEWAY_API_TOKEN)(?:[^A-Z_]|$)|\b(?:cloudflareAiGatewayId|deriveJobDataAiGatewayApiToken|aiApiToken)\b/m,
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
