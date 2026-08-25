import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();
const infrastructureDirectory = resolve(repositoryRoot, "infrastructure");
const rootsDirectory = resolve(infrastructureDirectory, "opentofu/roots");

function _readInfrastructureFile(path: string): string {
	return readFileSync(resolve(infrastructureDirectory, path), "utf8");
}

function _getRootHcl(rootName: string): string {
	return readdirSync(resolve(rootsDirectory, rootName))
		.filter((fileName) => fileName.endsWith(".tf"))
		.sort()
		.map((fileName) => readFileSync(resolve(rootsDirectory, rootName, fileName), "utf8"))
		.join("\n");
}

describe("cataqui.com OpenTofu ownership contract", () => {
	const dnsRoot = _getRootHcl("cloudflare-zone-dns");
	const configurationRoot = _getRootHcl("cloudflare-zone-configuration");
	const zoneRoots = [dnsRoot, configurationRoot].join("\n");

	it("should centralize the stable Cloudflare zone identifier", () => {
		const platforms = JSON.parse(_readInfrastructureFile("platforms.json"));

		expect(platforms.cloudflare).toEqual({
			account_id: "1fca946385505503c59dd6a2a4eeb442",
			zones: {
				"cataqui.com": {
					zone_id: "0c75bfd5c20cdbb338d44e62bcde8acc",
				},
			},
		});
		expect(zoneRoots).toMatch(/platforms\.cloudflare\.zones\["cataqui\.com"\]\.zone_id/);
		expect(zoneRoots).not.toMatch(/(?:cloudflare_account_id|cloudflare_zone_id)\s*=\s*"[0-9a-f]{32}"/);
	});

	it.each(["cloudflare-zone-dns", "cloudflare-zone-configuration"])(
		"should pin OpenTofu and Cloudflare for %s",
		(rootName) => {
			const versions = _readInfrastructureFile(`opentofu/roots/${rootName}/versions.tf`);

			expect(versions.match(/(?:required_version|version)\s*=\s*"=[^"]+"/g)).toEqual([
				'required_version = "= 1.12.6"',
				'version = "= 5.23.0"',
			]);
			expect(versions).toContain('backend "s3" {}');

			const lockfile = _readInfrastructureFile(`opentofu/roots/${rootName}/.terraform.lock.hcl`);
			expect(lockfile).toMatch(
				/provider "registry\.opentofu\.org\/cloudflare\/cloudflare" {[\s\S]*version\s*=\s*"5\.23\.0"/,
			);
		},
	);

	it.each([
		["cloudflare-zone-dns", "production/cloudflare-zone-dns/terraform.tfstate"],
		["cloudflare-zone-configuration", "production/cloudflare-zone-configuration/terraform.tfstate"],
	] as const)("should isolate the production backend for %s", (rootName, expectedKey) => {
		const backend = _readInfrastructureFile(`opentofu/environments/production/${rootName}.s3.tfbackend`);

		expect(backend.trim()).toBe(`key = "${expectedKey}"`);
	});

	it.each(["cloudflare-zone-dns", "cloudflare-zone-configuration"])(
		"should not create a staging backend for the global zone root %s",
		(rootName) => {
			expect(
				existsSync(resolve(infrastructureDirectory, "opentofu", "environments", "staging", `${rootName}.s3.tfbackend`)),
			).toBe(false);
		},
	);

	it("should preserve exact declarative import coverage", () => {
		expect(dnsRoot.match(/\bimport\s*{/g)).toHaveLength(9);
		expect(configurationRoot.match(/\bimport\s*{/g)).toHaveLength(18);

		for (const resourceId of [
			"771c4788c6ae6442bad55923e7cf8425",
			"3044984b4e7b338a810325fc97ba9231",
			"37a7a9eae1f4e6be3437458ab549463a",
			"bdd8f815b32367dcba6ae81ed6a6a70e",
			"2147a67332a1b936d00b6d9044a5a608",
			"6cde72c01e2a65638de179771a198c48",
			"e7e5d67758577763ae4ca2fcb17329e0",
			"08007eb19d33058671c4c6772a02a8d9",
			"1b2257ab139d4cc0bffd2dae645543aa",
			"1decd5c88e054dfc80115bc79657b2e7",
			"5b31aefb0aa04963a54b2ebb465ab226",
			"b26d60d1beb5415f91780347f5d1c567",
		]) {
			expect(zoneRoots).toContain(resourceId);
		}
	});

	it.each(["cloudflare-zone-dns", "cloudflare-zone-configuration"])(
		"should keep imports fail-closed outside mocked tests for %s",
		(rootName) => {
			const variables = _readInfrastructureFile(`opentofu/roots/${rootName}/variables.tf`);
			const tests = readFileSync(resolve(rootsDirectory, rootName, "tests", `${rootName}.tftest.hcl`), "utf8");

			expect(variables).toMatch(/variable "enable_imports" {[\s\S]*default\s*=\s*true/);
			expect(_getRootHcl(rootName)).toMatch(
				/for_each\s*=\s*var\.enable_imports \? toset\(\["enabled"\]\) : toset\(\[\]\)/,
			);
			expect(tests).toMatch(/variables {[\s\S]*enable_imports\s*=\s*false/);
		},
	);

	it("should protect every material resource block from destruction", () => {
		expect(dnsRoot.match(/prevent_destroy\s*=\s*true/g)).toHaveLength(9);
		expect(configurationRoot.match(/prevent_destroy\s*=\s*true/g)).toHaveLength(18);
	});

	it("should leave Email Routing and Cloudflare-owned resources outside state", () => {
		expect(zoneRoots).not.toMatch(/resource\s+"cloudflare_email_routing_/);
		expect(dnsRoot).not.toMatch(/type\s*=\s*"MX"|_domainkey/);
		expect(configurationRoot).not.toMatch(/phase\s*=\s*"ddos_/);
	});

	it("should leave provider-limited SSL Automatic Mode unmanaged", () => {
		expect(zoneRoots).not.toMatch(/ssl_automatic_mode/);
	});

	it("should prohibit credentials, HCP configuration, and outputs", () => {
		const committedConfiguration = [
			zoneRoots,
			_readInfrastructureFile("opentofu/backends/r2.s3.tfbackend"),
			_readInfrastructureFile("opentofu/environments/production/cloudflare-zone-dns.s3.tfbackend"),
			_readInfrastructureFile("opentofu/environments/production/cloudflare-zone-configuration.s3.tfbackend"),
			_readInfrastructureFile("platforms.json"),
		].join("\n");

		expect(committedConfiguration).not.toMatch(
			/(?:api_token|api_key|access_key|secret_access_key|private_key|password)\s*=\s*"[^"$]+"/i,
		);
		expect(zoneRoots).not.toMatch(/\bcloud\s*{|app\.terraform\.io|HCP Terraform/i);
		expect(zoneRoots).not.toMatch(/\boutput\s+"/);
	});

	it("should discover every OpenTofu root through the shared runner", () => {
		const rootNames = readdirSync(rootsDirectory, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name)
			.sort();
		const runner = _readInfrastructureFile("opentofu/run-root-command.mjs");

		expect(rootNames).toEqual([
			"auth-secrets",
			"cloudflare-ai-gateways",
			"cloudflare-api-tokens",
			"cloudflare-queues",
			"cloudflare-zone-configuration",
			"cloudflare-zone-dns",
			"google-cloud-maps-platform",
			"google-cloud-projects",
			"infisical-generated-folders",
			"neon-database-access",
			"neon-projects",
			"upstash-redis",
		]);
		expect(runner).toContain('new URL("./roots/", import.meta.url)');
		expect(runner).not.toContain("cloudflare-ai-gateways");
	});
});
