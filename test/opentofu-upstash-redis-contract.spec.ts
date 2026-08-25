import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();
const infrastructureDirectory = resolve(repositoryRoot, "infrastructure");
const rootDirectory = resolve(infrastructureDirectory, "opentofu/roots/upstash-redis");

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

describe("Upstash Redis OpenTofu contract", () => {
	it("should pin OpenTofu and the Upstash and Infisical providers", () => {
		const versions = _readInfrastructureFile("opentofu/roots/upstash-redis/versions.tf");
		const lockfile = _readInfrastructureFile("opentofu/roots/upstash-redis/.terraform.lock.hcl");

		expect(versions).toContain('required_version = "= 1.12.6"');
		expect(versions).toContain('source  = "upstash/upstash"');
		expect(versions).toContain('version = "= 2.1.0"');
		expect(versions).toContain('source  = "infisical/infisical"');
		expect(versions).toContain('version = "= 0.19.21"');
		expect(lockfile).toMatch(/provider "registry\.opentofu\.org\/upstash\/upstash"[\s\S]*version\s*=\s*"2\.1\.0"/);
		expect(lockfile).toMatch(
			/provider "registry\.opentofu\.org\/infisical\/infisical"[\s\S]*version\s*=\s*"0\.19\.21"/,
		);
	});

	it.each([
		["staging", "staging/upstash-redis/terraform.tfstate"],
		["production", "production/upstash-redis/terraform.tfstate"],
	] as const)("should isolate the %s backend", (environment, expectedKey) => {
		const backend = _readInfrastructureFile(`opentofu/environments/${environment}/upstash-redis.s3.tfbackend`);

		expect(backend.trim()).toBe(`key = "${expectedKey}"`);
		expect(backend).not.toMatch(/(?:access_key|secret_key|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY)\s*=/);
	});

	it("should create protected paid databases matching the API placement and cost profile", () => {
		const rootHcl = _getRootHcl();

		expect(rootHcl).toContain('name           = "cataqui-api-staging"');
		expect(rootHcl).toContain('name           = "cataqui-api-production"');
		expect(rootHcl).toMatch(/region\s*=\s*"global"/);
		expect(rootHcl).toMatch(/primary_region\s*=\s*"sa-east-1"/);
		expect(rootHcl).toMatch(/read_regions\s*=\s*\[\]/);
		expect(rootHcl).toMatch(/tls\s*=\s*true/);
		expect(rootHcl).toMatch(/eviction\s*=\s*false/);
		expect(rootHcl).toMatch(/auto_scale\s*=\s*false/);
		expect(rootHcl).toMatch(/prod_pack\s*=\s*false/);
		expect(rootHcl).toMatch(/prevent_destroy\s*=\s*true/);
		expect(rootHcl).toMatch(/condition\s*=\s*self\.database_type == "paid"/);
		expect(rootHcl).not.toMatch(/ip_allowlist|\bmultizone\s*=|\bconsistent\s*=/);
	});

	it("should publish only the API runtime contract through write-only Infisical fields", () => {
		const rootHcl = _getRootHcl();

		expect(rootHcl).toMatch(/name\s*=\s*"UPSTASH_REDIS_REST_URL"/);
		expect(rootHcl).toMatch(/name\s*=\s*"UPSTASH_REDIS_REST_TOKEN"/);
		expect(rootHcl.match(/folder_path\s*=\s*"\/generated\/api\/runtime"/g)).toHaveLength(2);
		expect(rootHcl.match(/value_wo_version\s*=\s*1/g)).toHaveLength(2);
		expect(rootHcl).toMatch(/value_wo\s*=\s*upstash_redis_database\.api\.rest_token/);
		expect(rootHcl).not.toMatch(/read_only_rest_token|\n\s*value\s*=/);
	});

	it("should leave provider authentication for the future executor", () => {
		const providers = _readInfrastructureFile("opentofu/roots/upstash-redis/providers.tf");
		const committedConfiguration = [
			_getRootHcl(),
			_readInfrastructureFile("opentofu/environments/staging/upstash-redis.s3.tfbackend"),
			_readInfrastructureFile("opentofu/environments/production/upstash-redis.s3.tfbackend"),
		].join("\n");

		expect(providers).toContain('provider "upstash" {}');
		expect(providers).not.toMatch(/email\s*=|api_key\s*=/);
		expect(committedConfiguration).not.toContain('variable "upstash_api_key"');
		expect(committedConfiguration).not.toMatch(
			/(?:api_token|api_key|access_key|secret_access_key|private_key|password)\s*=\s*"[^"$]+"/i,
		);
		expect(committedConfiguration).not.toMatch(/\boutput\s+"|\bcloud\s*{|app\.terraform\.io|HCP Terraform/i);
	});

	it("should match the existing application runtime variables", () => {
		const applicationConfiguration = [
			readFileSync(resolve(repositoryRoot, "apps/api/src/core/config/upstash-redis.config.ts"), "utf8"),
			readFileSync(resolve(repositoryRoot, "apps/api/wrangler.jsonc"), "utf8"),
			readFileSync(resolve(repositoryRoot, "apps/api/src/platform/cloudflare/containers/api/api-container.ts"), "utf8"),
		].join("\n");

		expect(applicationConfiguration).toContain("UPSTASH_REDIS_REST_URL");
		expect(applicationConfiguration).toContain("UPSTASH_REDIS_REST_TOKEN");
	});
});
