import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();
const infrastructureDirectory = resolve(repositoryRoot, "infrastructure");
const rootsDirectory = resolve(infrastructureDirectory, "opentofu/roots");
const rootNames = ["google-cloud-projects", "google-cloud-maps-platform"] as const;

function _readInfrastructureFile(path: string): string {
	return readFileSync(resolve(infrastructureDirectory, path), "utf8");
}

function _getRootHcl(rootName: (typeof rootNames)[number]): string {
	return readdirSync(resolve(rootsDirectory, rootName))
		.filter((fileName) => fileName.endsWith(".tf"))
		.sort()
		.map((fileName) => readFileSync(resolve(rootsDirectory, rootName, fileName), "utf8"))
		.join("\n");
}

describe("Google Cloud OpenTofu contract", () => {
	it("should centralize stable Google Cloud organization and billing identifiers", () => {
		const platforms = JSON.parse(_readInfrastructureFile("platforms.json"));
		const projectRoot = _getRootHcl("google-cloud-projects");

		expect(platforms.google_cloud).toEqual({
			organization_id: "945579294313",
			billing_account_id: "01A827-CA7CE9-646496",
		});
		expect(projectRoot).toMatch(/local\.platforms\.google_cloud\.organization_id/);
		expect(projectRoot).toMatch(/local\.platforms\.google_cloud\.billing_account_id/);
		expect(projectRoot).not.toMatch(/(?:organization_id|billing_account)\s*=\s*"[0-9A-F-]+"/);
	});

	it("should keep Maps application policy inside the owning root", () => {
		const platforms = JSON.parse(_readInfrastructureFile("platforms.json"));
		const mapsRoot = _getRootHcl("google-cloud-maps-platform");

		expect(platforms.google_cloud).not.toHaveProperty("maps_platform");
		expect(mapsRoot).toMatch(/mobile_applications\s*=\s*{/);
		expect(mapsRoot).toContain('package_name = "com.cataqui.mobile.development"');
		expect(mapsRoot).toContain('package_name = "com.cataqui.mobile"');
		expect(mapsRoot).toContain('bundle_id = "com.cataqui.mobile.development"');
		expect(mapsRoot).toContain('bundle_id = "com.cataqui.mobile"');
	});

	it.each([
		["google-cloud-projects", ['version = "= 7.45.0"', 'version = "= 3.9.0"']],
		["google-cloud-maps-platform", ['version = "= 7.45.0"', 'version = "= 0.19.21"']],
	] as const)("should pin OpenTofu and providers for %s", (rootName, providerVersions) => {
		const versions = _readInfrastructureFile(`opentofu/roots/${rootName}/versions.tf`);
		const lockfile = _readInfrastructureFile(`opentofu/roots/${rootName}/.terraform.lock.hcl`);

		expect(versions).toContain('required_version = "= 1.12.6"');
		expect(versions).toContain('backend "s3" {}');
		for (const providerVersion of providerVersions) {
			const versionNumber = providerVersion.match(/"= ([^"]+)"/)?.[1];

			expect(versions).toContain(providerVersion);
			expect(versionNumber).toBeDefined();
			expect(lockfile).toMatch(new RegExp(`version\\s*=\\s*"${versionNumber}"`));
		}
	});

	it.each(
		rootNames.flatMap((rootName) =>
			(["staging", "production"] as const).map(
				(environment) => [environment, rootName, `${environment}/${rootName}/terraform.tfstate`] as const,
			),
		),
	)("should isolate the %s backend for %s", (environment, rootName, expectedKey) => {
		const backend = _readInfrastructureFile(`opentofu/environments/${environment}/${rootName}.s3.tfbackend`);

		expect(backend.trim()).toBe(`key = "${expectedKey}"`);
		expect(backend).not.toMatch(/(?:access_key|secret_key|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY)\s*=/);
	});

	it("should create protected randomized projects with non-secret outputs", () => {
		const rootHcl = _getRootHcl("google-cloud-projects");
		const outputs = _readInfrastructureFile("opentofu/roots/google-cloud-projects/outputs.tf");

		expect(rootHcl).toMatch(/resource "random_id" "project_suffix"[\s\S]*byte_length\s*=\s*3/);
		expect(rootHcl).toContain('name      = "cataqui-staging"');
		expect(rootHcl).toContain('name      = "cataqui-production"');
		expect(rootHcl).toMatch(/project_id\s*=\s*"\$\{local\.project\.id_prefix\}-\$\{random_id\.project_suffix\.hex\}"/);
		expect(rootHcl).toMatch(/auto_create_network\s*=\s*false/);
		expect(rootHcl).toMatch(/deletion_policy\s*=\s*"PREVENT"/);
		expect(rootHcl).toMatch(/prevent_destroy\s*=\s*true/);
		expect(rootHcl).not.toMatch(/\bimport\s*{|\binfisical_/);
		expect(outputs.match(/output "/g)).toHaveLength(2);
		expect(outputs).toMatch(/output "project_id"[\s\S]*google_project\.cataqui\.project_id/);
		expect(outputs).toMatch(/output "project_number"[\s\S]*google_project\.cataqui\.number/);
		expect(outputs).not.toMatch(/sensitive\s*=\s*true/);
	});

	it("should consume only the matching non-secret projects state", () => {
		const state = _readInfrastructureFile("opentofu/roots/google-cloud-maps-platform/state.tf");

		expect(state).toMatch(/data "terraform_remote_state" "google_cloud_projects"/);
		expect(state).toMatch(/key\s*=\s*"\$\{var\.environment\}\/google-cloud-projects\/terraform\.tfstate"/);
		expect(state).toMatch(/bucket\s*=\s*"cataqui-opentofu-state"/);
		expect(state).toMatch(/use_lockfile\s*=\s*true/);
		expect(state).toMatch(/use_path_style\s*=\s*true/);
		expect(state).not.toMatch(/(?:access_key|secret_key|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY)\s*=/);
	});

	it("should enable the exact Maps Platform services and create independently restricted keys", () => {
		const rootHcl = _getRootHcl("google-cloud-maps-platform");

		for (const service of [
			"apikeys.googleapis.com",
			"maps-android-backend.googleapis.com",
			"maps-ios-backend.googleapis.com",
			"places.googleapis.com",
		]) {
			expect(rootHcl).toContain(`"${service}"`);
		}
		expect(rootHcl.match(/resource "google_apikeys_key"/g)).toHaveLength(3);
		expect(rootHcl).toMatch(/api_targets\s*{[\s\S]*service\s*=\s*"places\.googleapis\.com"/);
		expect(rootHcl).toMatch(/android_key_restrictions\s*{[\s\S]*maps-android-backend\.googleapis\.com/);
		expect(rootHcl).toMatch(/ios_key_restrictions\s*{[\s\S]*maps-ios-backend\.googleapis\.com/);
		expect(rootHcl).toMatch(/lower\(replace\([\s\S]*sha1_fingerprints/);
		expect(rootHcl).toMatch(/disable_on_destroy\s*=\s*false/);
		expect(rootHcl.match(/deletion_policy\s*=\s*"PREVENT"/g)).toHaveLength(3);
		expect(rootHcl.match(/prevent_destroy\s*=\s*true/g)).toHaveLength(3);
		expect(rootHcl).not.toMatch(/GOOGLE_MAPS_API_KEY|github_/i);
	});

	it("should deliver the Places key only through the Geosearch write-only field", () => {
		const rootHcl = _getRootHcl("google-cloud-maps-platform");

		expect(rootHcl).toMatch(/name\s*=\s*"cataqui-geosearch-places-\$\{var\.environment\}"/);
		expect(rootHcl).toMatch(/display_name\s*=\s*"Cataqui Geosearch Places \$\{title\(var\.environment\)\}"/);
		expect(rootHcl).toMatch(/folder_path\s*=\s*"\/generated\/geosearch\/runtime"/);
		expect(rootHcl).toMatch(/name\s*=\s*"GOOGLE_PLACES_API_KEY"/);
		expect(rootHcl).toMatch(/value_wo\s*=\s*google_apikeys_key\.geosearch_places\.key_string/);
		expect(rootHcl).toMatch(/value_wo_version\s*=\s*1/);
		expect(rootHcl.match(/resource "infisical_secret"/g)).toHaveLength(1);
		expect(rootHcl).not.toMatch(/\n\s*value\s*=|\boutput\s+"/);
	});

	it("should prohibit committed credentials and legacy execution references", () => {
		const committedConfiguration = [
			...rootNames.map((rootName) => _getRootHcl(rootName)),
			...rootNames.flatMap((rootName) =>
				["staging", "production"].map((environment) =>
					_readInfrastructureFile(`opentofu/environments/${environment}/${rootName}.s3.tfbackend`),
				),
			),
			_readInfrastructureFile("platforms.json"),
		].join("\n");

		expect(committedConfiguration).not.toMatch(
			/(?:^|\s)(?:api_token|api_key|access_key|secret_access_key|private_key|password)\s*=\s*"[^"$]+"/i,
		);
		expect(committedConfiguration).not.toMatch(/\bcloud\s*{|app\.terraform\.io|HCP Terraform/i);
	});
});
