import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const infrastructureDirectory = resolve(process.cwd(), "infrastructure");

function _readInfrastructureFile(path: string): string {
	return readFileSync(resolve(infrastructureDirectory, path), "utf8");
}

describe("Maps R2 infrastructure contract", () => {
	it("protects bucket deletion and keeps storage private without object locks or public domains", () => {
		const main = _readInfrastructureFile("opentofu/roots/cloudflare-r2/main.tf");
		expect(main).toMatch(/resource "cloudflare_r2_bucket" "maps" {[\s\S]*?lifecycle {\s*prevent_destroy = true/);
		expect(main).toMatch(/resource "cloudflare_r2_managed_domain"[\s\S]*?enabled\s*=\s*false/);
		expect(main).not.toMatch(
			/cloudflare_r2_(custom_domain|bucket_lock|bucket_cors)|delete_objects_transition|storage_class_transitions/,
		);
	});

	it("pins the existing toolchain and uses the shared account and manifest identities", () => {
		const versions = _readInfrastructureFile("opentofu/roots/cloudflare-r2/versions.tf");
		expect(versions).toContain('required_version = "= 1.12.6"');
		expect(versions).toContain('version = "= 5.23.0"');
		const locals = _readInfrastructureFile("opentofu/roots/cloudflare-r2/locals.tf");
		expect(locals).toMatch(/local\.manifest\.cloudflare\.r2\.buckets\["maps_\$\{var\.environment\}"\]/);
		expect(locals).toContain("local.platforms.cloudflare.account_id");
	});

	it.each(["staging", "production"])("isolates %s state without embedded credentials", (environment) => {
		const backend = _readInfrastructureFile(`opentofu/environments/${environment}/cloudflare-r2.s3.tfbackend`);
		expect(backend.trim()).toBe(`key = "${environment}/cloudflare-r2/terraform.tfstate"`);
	});
});
