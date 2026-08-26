import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();
const infrastructureDirectory = resolve(repositoryRoot, "infrastructure");
const rootDirectory = resolve(infrastructureDirectory, "opentofu/roots/cloudflare-api-tokens");

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

describe("Cloudflare API tokens OpenTofu contract", () => {
	const rootHcl = _getRootHcl();

	it("should pin the approved toolchain and isolate both environment states", () => {
		const versions = _readInfrastructureFile("opentofu/roots/cloudflare-api-tokens/versions.tf");

		expect(versions.match(/(?:required_version|version)\s*=\s*"=[^"]+"/g)).toEqual([
			'required_version = "= 1.12.6"',
			'version = "= 5.23.0"',
			'version = "= 0.19.21"',
		]);
		for (const environment of ["staging", "production"]) {
			const backend = _readInfrastructureFile(
				`opentofu/environments/${environment}/cloudflare-api-tokens.s3.tfbackend`,
			);
			expect(backend.trim()).toBe(`key = "${environment}/cloudflare-api-tokens/terraform.tfstate"`);
			expect(backend).not.toMatch(/(?:access_key|secret_key|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY)\s*=/);
		}

		const lockfile = _readInfrastructureFile("opentofu/roots/cloudflare-api-tokens/.terraform.lock.hcl");
		expect(lockfile).toMatch(/cloudflare\/cloudflare" {[\s\S]*version\s*=\s*"5\.23\.0"/);
		expect(lockfile).toMatch(/infisical\/infisical" {[\s\S]*version\s*=\s*"0\.19\.21"/);
	});

	it("should use the centralized Infisical project identity", () => {
		const platforms = JSON.parse(_readInfrastructureFile("platforms.json"));
		const manifest = JSON.parse(_readInfrastructureFile("manifest.json"));

		expect(platforms.infisical).toEqual({ organization_id: "33687647-d8e9-44a7-9cb9-721bd5b28a45" });
		expect(manifest.infisical.project).toEqual({
			name: "Cataquí Backend",
			slug: "cataqui-backend-6xt3g",
		});
		expect(rootHcl).toMatch(/module "infisical_project"/);
		expect(rootHcl).toMatch(/source\s*=\s*"\.\.\/\.\.\/modules\/infisical-project"/);
		expect(rootHcl).toMatch(/local\.manifest\.infisical\.project\.slug/);
		expect(rootHcl).toMatch(/module\.infisical_project\.id/);
	});

	it("should create the exact environment-specific token inventory", () => {
		for (const rootName of [
			"cloudflare-ai-gateways",
			"cloudflare-queues",
			"cloudflare-zone-dns",
			"cloudflare-zone-configuration",
		]) {
			expect(rootHcl).toContain(`${rootName} = {`);
		}
		expect(rootHcl).toMatch(/var\.environment == "production" \? local\.production_infrastructure_tokens : {}/);
		expect(rootHcl).not.toMatch(/(?:folder_path|name)\s*=.*(?:plan|apply)/);
		expect(rootHcl).toMatch(/ai_gateway_runtime_tokens\s*=\s*{\s*api\s*=\s*{/);
		expect(rootHcl).toMatch(/name\s*=\s*"cataqui-\$\{each\.key\}-ai-gateway-\$\{var\.environment\}"/);
		expect(rootHcl).toMatch(/worker_deployment_tokens\s*=\s*{\s*api\s*=\s*{/);
		expect(rootHcl).toMatch(/name\s*=\s*"cataqui-\$\{each\.key\}-workers-deployment-\$\{var\.environment\}"/);
	});

	it("should resolve exact permissions without hardcoded IDs", () => {
		for (const permission of [
			"AI Gateway Read",
			"AI Gateway Write",
			"AI Gateway Run",
			"Queues Read",
			"Queues Write",
			"Workers Scripts Read",
			"Workers Scripts Write",
			"Workers Containers Read",
			"Workers Containers Write",
			"Account Settings Read",
			"Zone Read",
			"DNS Read",
			"DNS Write",
			"Workers Routes Read",
			"Workers Routes Write",
			"Zone Settings Read",
			"Zone Settings Write",
			"Zone WAF Read",
			"Zone WAF Write",
			"Bot Management Read",
			"Bot Management Write",
			"Response Compression Read",
			"Response Compression Write",
			"SSL and Certificates Read",
			"SSL and Certificates Write",
		]) {
			expect(rootHcl).toContain(`name  = "${permission}"`);
		}
		expect(rootHcl).toMatch(/data "cloudflare_api_token_permission_groups_list" "required"/);
		expect(rootHcl).toMatch(
			/length\(data\.cloudflare_api_token_permission_groups_list\.required\[permission\]\.result\) == 1/,
		);
		expect(rootHcl).not.toMatch(/id\s*=\s*"[0-9a-f]{32}"/);
		expect(rootHcl).not.toMatch(/%20/);
	});

	it("should scope account and zone tokens narrowly", () => {
		expect(rootHcl).toMatch(/"com\.cloudflare\.api\.account\.\$\{local\.cloudflare_account_id\}"/);
		expect(rootHcl).toMatch(/"com\.cloudflare\.api\.account\.zone\.\$\{local\.cataqui_zone_id\}"/);
		expect(rootHcl).toMatch(/local\.platforms\.cloudflare\.zones\["cataqui\.com"\]\.zone_id/);
		expect(rootHcl).not.toMatch(/com\.cloudflare\.api\.account\.\*|com\.cloudflare\.api\.account\.zone\.\*/);
	});

	it("should deliver only write-only Infisical copies to exact destinations", () => {
		expect(rootHcl.match(/resource "infisical_secret"/g)).toHaveLength(3);
		expect(rootHcl).toMatch(/folder_path\s*=\s*"\/generated\/opentofu\/\$\{each\.key\}"/);
		expect(rootHcl).toContain('name             = "CLOUDFLARE_API_TOKEN"');
		expect(rootHcl).toContain('folder_path = "/generated/api/runtime"');
		expect(rootHcl).toContain('secret_name = "AI_GATEWAY_API_TOKEN"');
		expect(rootHcl).toContain("folder_path      = each.value.folder_path");
		for (const path of [
			"/generated/api/deployment",
			"/generated/geosearch/deployment",
			"/generated/webhooks/deployment",
		]) {
			expect(rootHcl).toMatch(new RegExp(`folder_path\\s*=\\s*"${path}"`));
		}
		expect(rootHcl.match(/value_wo\s*=/g)).toHaveLength(3);
		expect(rootHcl.match(/value_wo_version\s*=\s*1/g)).toHaveLength(3);
		expect(rootHcl).not.toMatch(/^\s*value\s*=/m);
		expect(rootHcl).not.toMatch(/\boutput\s+"/);
	});

	it("should protect tokens and their destination secrets without expiration or IP conditions", () => {
		expect(rootHcl.match(/prevent_destroy\s*=\s*true/g)).toHaveLength(6);
		expect(rootHcl).not.toMatch(/\b(?:request_ip|expires_on|not_before)\s*=/);
		expect(rootHcl).not.toMatch(/^\s*condition\s*=\s*{/m);
		expect(rootHcl).toMatch(/name\s*=\s*"cataqui-opentofu-\$\{each\.key\}-\$\{var\.environment\}"/);
		expect(rootHcl).toMatch(/name\s*=\s*"cataqui-\$\{each\.key\}-ai-gateway-\$\{var\.environment\}"/);
		expect(rootHcl).toMatch(/name\s*=\s*"cataqui-\$\{each\.key\}-workers-deployment-\$\{var\.environment\}"/);
	});

	it("should keep the bootstrap issuer and backend credentials external", () => {
		const committedConfiguration = [
			rootHcl,
			_readInfrastructureFile("platforms.json"),
			_readInfrastructureFile("manifest.json"),
			_readInfrastructureFile("opentofu/backends/r2.s3.tfbackend"),
		].join("\n");

		expect(committedConfiguration).not.toMatch(
			/(?:^|\s)(?:api_token|api_key|access_key|secret_access_key|private_key|password)\s*=\s*"[^"$]+"/i,
		);
		expect(rootHcl).not.toContain("/opentofu/bootstrap");
		expect(_readInfrastructureFile("AGENTS.md")).toContain("`/opentofu/bootstrap`");
		expect(_readInfrastructureFile("AGENTS.md")).not.toContain("/opentofu/bootstrap/");
		expect(committedConfiguration).not.toMatch(/\boutput\s+"|\bcloud\s*{|app\.terraform\.io|HCP Terraform/i);
	});
});
