import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();
const infrastructureDirectory = resolve(repositoryRoot, "infrastructure");
const rootsDirectory = resolve(infrastructureDirectory, "opentofu/roots");

const rootNames = ["infisical-generated-folders", "neon-projects", "neon-database-access"] as const;

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

describe("Neon OpenTofu contract", () => {
	it("should centralize the Neon organization as a committed non-secret identifier", () => {
		const platforms = JSON.parse(_readInfrastructureFile("platforms.json"));

		expect(platforms.neon).toEqual({
			organization_id: "org-wandering-pond-46567045",
			database: { name: "cataqui", owner_role: "db_owner", runtime_role: "db_user" },
		});
		expect(_getRootHcl("neon-projects")).toMatch(/local\.platforms\.neon\.organization_id/);
		const projectRoot = _getRootHcl("neon-projects");
		const accessRoot = _getRootHcl("neon-database-access");

		expect(projectRoot).toMatch(/local\.platforms\.neon\.database\.name/);
		expect(projectRoot).toMatch(/local\.platforms\.neon\.database\.owner_role/);
		expect(accessRoot).toMatch(/local\.platforms\.neon\.database\.name/);
		expect(accessRoot).toMatch(/local\.platforms\.neon\.database\.owner_role/);
		expect(accessRoot).toMatch(/local\.platforms\.neon\.database\.runtime_role/);
		expect(_getRootHcl("neon-projects")).not.toMatch(/neon_organization_id\s*=\s*"org-/);
	});

	it.each([
		["infisical-generated-folders", ['version = "= 0.19.21"']],
		["neon-projects", ['version = "= 0.19.21"', 'version = "= 0.15.0"']],
		["neon-database-access", ['version = "= 0.19.21"', 'version = "= 1.27.0"', 'version = "= 3.9.0"']],
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

	it("should centralize generated Infisical folder ownership", () => {
		const folderRoot = _getRootHcl("infisical-generated-folders");
		const gatewayRoot = _getRootHcl("neon-projects");
		const aiGatewayRoot = readdirSync(resolve(rootsDirectory, "cloudflare-ai-gateways"))
			.filter((fileName) => fileName.endsWith(".tf"))
			.map((fileName) => readFileSync(resolve(rootsDirectory, "cloudflare-ai-gateways", fileName), "utf8"))
			.join("\n");

		expect(folderRoot.match(/resource "infisical_secret_folder"/g)).toHaveLength(3);
		expect(folderRoot).toMatch(/name\s*=\s*"generated"/);
		expect(folderRoot).toMatch(/name\s*=\s*"runtime"/);
		expect(folderRoot).toMatch(/name\s*=\s*"deployment"/);
		expect(folderRoot.match(/force_delete\s*=\s*false/g)).toHaveLength(3);
		expect([gatewayRoot, aiGatewayRoot].join("\n")).not.toMatch(/resource "infisical_secret_folder"/);
	});

	it("should create protected cost-first Neon projects", () => {
		const rootHcl = _getRootHcl("neon-projects");

		expect(rootHcl).toContain('name                      = "cataqui-staging"');
		expect(rootHcl).toContain('name                      = "cataqui-production"');
		expect(rootHcl).toMatch(/region_id\s*=\s*"aws-sa-east-1"/);
		expect(rootHcl).toMatch(/pg_version\s*=\s*18/);
		expect(rootHcl).toMatch(/database_name\s*=\s*local\.database_name/);
		expect(rootHcl).toMatch(/role_name\s*=\s*local\.database_owner_role_name/);
		expect(rootHcl).toMatch(/default_branch_protected\s*=\s*true/);
		expect(rootHcl).toMatch(/enable_logical_replication\s*=\s*"no"/);
		expect(rootHcl).toMatch(/suspend_timeout_seconds\s*=\s*300/);
		expect(rootHcl).toMatch(/prevent_destroy\s*=\s*true/);
		expect(rootHcl).not.toMatch(/\bquota\s*{|allowed_ips|block_public_connections|resource "neon_(?:branch|endpoint)"/);
	});

	it("should transfer owner values only through Infisical write-only fields", () => {
		const rootHcl = _getRootHcl("neon-projects");
		const expectedSecrets = [
			"DATABASE_OWNER_DIRECT_URL",
			"DATABASE_OWNER_HOST",
			"DATABASE_OWNER_PASSWORD",
			"DATABASE_POOLER_HOST",
		];

		for (const secretName of expectedSecrets) {
			expect(rootHcl).toContain(`name             = "${secretName}"`);
		}
		expect(rootHcl).not.toMatch(/name\s*=\s*"(?:DATABASE_OWNER_USERNAME|DATABASE_NAME)"/);
		expect(rootHcl.match(/folder_path\s*=\s*"\/generated\/deployment"/g)).toHaveLength(4);
		expect(rootHcl.match(/value_wo\s*=\s*neon_project\.cataqui\./g)).toHaveLength(4);
		expect(rootHcl).not.toMatch(/\n\s*value\s*=/);
	});

	it("should keep database credentials ephemeral through least-privilege access provisioning", () => {
		const rootHcl = _getRootHcl("neon-database-access");

		expect(rootHcl.match(/ephemeral "infisical_secret"/g)).toHaveLength(3);
		expect(rootHcl).toMatch(/ephemeral "random_password" "db_user"[\s\S]*length\s*=\s*40[\s\S]*special\s*=\s*false/);
		expect(rootHcl).toMatch(/password_wo\s*=\s*ephemeral\.random_password\.db_user\.result/);
		expect(rootHcl).toMatch(/name\s*=\s*local\.database_runtime_username/);
		expect(rootHcl).toMatch(/superuser\s*=\s*false/);
		expect(rootHcl).toMatch(/create_database\s*=\s*false/);
		expect(rootHcl).toMatch(/create_role\s*=\s*false/);
		expect(rootHcl).toMatch(/replication\s*=\s*false/);
		expect(rootHcl).toMatch(/bypass_row_level_security\s*=\s*false/);
		expect(rootHcl).toMatch(/name\s*=\s*"DATABASE_APP_POOLER_URL"[\s\S]*value_wo\s*=\s*local\.database_app_pooler_url/);
		expect(rootHcl).not.toMatch(/\bpassword\s*=\s*"|\n\s*value\s*=/);
	});

	it("should preserve migration-only owner access and pooled runtime access", () => {
		const prismaConfiguration = readFileSync(resolve(repositoryRoot, "apps/api/prisma.config.ts"), "utf8");
		const runtimeConfiguration = [
			readFileSync(resolve(repositoryRoot, "apps/api/src/core/config/database.config.ts"), "utf8"),
			readFileSync(resolve(repositoryRoot, "apps/api/wrangler.jsonc"), "utf8"),
			readFileSync(resolve(repositoryRoot, "apps/api/src/platform/cloudflare/containers/api/api-container.ts"), "utf8"),
		].join("\n");

		expect(prismaConfiguration).toContain("DATABASE_OWNER_DIRECT_URL");
		expect(runtimeConfiguration).toContain("DATABASE_APP_POOLER_URL");
		expect(runtimeConfiguration).not.toContain("DATABASE_OWNER_DIRECT_URL");
	});

	it("should prohibit committed credentials and secret outputs", () => {
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
		expect(committedConfiguration).not.toMatch(/\boutput\s+"|\bcloud\s*{|app\.terraform\.io|HCP Terraform/i);
	});
});
