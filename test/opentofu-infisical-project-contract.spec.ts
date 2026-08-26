import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();
const infrastructureDirectory = resolve(repositoryRoot, "infrastructure");
const infisicalProjectModuleDirectory = resolve(infrastructureDirectory, "opentofu/modules/infisical-project");
const infisicalRoots = [
	"auth-secrets",
	"cloudflare-api-tokens",
	"google-cloud-maps-platform",
	"infisical-generated-folders",
	"neon-api-keys",
	"neon-database-access",
	"neon-projects",
	"upstash-redis",
];

function _readRoot(rootName: string): string {
	const rootDirectory = resolve(infrastructureDirectory, "opentofu/roots", rootName);
	return readdirSync(rootDirectory)
		.filter((fileName) => fileName.endsWith(".tf"))
		.sort()
		.map((fileName) => readFileSync(resolve(rootDirectory, fileName), "utf8"))
		.join("\n");
}

function _readInfisicalProjectModule(): string {
	return readdirSync(infisicalProjectModuleDirectory)
		.filter((fileName) => fileName.endsWith(".tf"))
		.sort()
		.map((fileName) => readFileSync(resolve(infisicalProjectModuleDirectory, fileName), "utf8"))
		.join("\n");
}

describe("Infisical OpenTofu project resolution", () => {
	it("commits only the stable organization and project identity", () => {
		const platforms = JSON.parse(readFileSync(resolve(infrastructureDirectory, "platforms.json"), "utf8"));
		const manifest = JSON.parse(readFileSync(resolve(infrastructureDirectory, "manifest.json"), "utf8"));

		expect(platforms.infisical).toEqual({ organization_id: "33687647-d8e9-44a7-9cb9-721bd5b28a45" });
		expect(manifest.infisical.project).toEqual({ name: "Cataquí Backend", slug: "cataqui-backend-6xt3g" });
		expect(platforms.infisical).not.toHaveProperty("project_id");
		expect(platforms.infisical).not.toHaveProperty("project_slug");
		expect(manifest.infisical).not.toHaveProperty("project_id");
		expect(manifest.infisical).not.toHaveProperty("project_slug");
	});

	it("centralizes project resolution and ownership checks in one module", () => {
		const module = _readInfisicalProjectModule();

		expect(module).toMatch(/data "infisical_projects" "this"/);
		expect(module).toMatch(/slug\s*=\s*var\.project_slug/);
		expect(module).toMatch(/data\.infisical_projects\.this\.org_id == var\.organization_id/);
		expect(module).toMatch(/data\.infisical_projects\.this\.name == var\.project_name/);
		expect(module).toMatch(/data\.infisical_projects\.this\.type == "secret-manager"/);
		expect(module).toMatch(/contains\(keys\(data\.infisical_projects\.this\.environments\), var\.environment\)/);
		expect(module).toMatch(/value\s*=\s*data\.infisical_projects\.this\.id/);
	});

	it.each(infisicalRoots)("uses the shared project module in %s", (rootName) => {
		const root = _readRoot(rootName);

		expect(root).toMatch(/module "infisical_project"/);
		expect(root).toMatch(/source\s*=\s*"\.\.\/\.\.\/modules\/infisical-project"/);
		expect(root).toMatch(/organization_id\s*=\s*local\.platforms\.infisical\.organization_id/);
		expect(root).toMatch(/project_name\s*=\s*local\.manifest\.infisical\.project\.name/);
		expect(root).toMatch(/project_slug\s*=\s*local\.manifest\.infisical\.project\.slug/);
		expect(root).toMatch(/environment\s*=\s*var\.environment/);
		expect(root).toMatch(/infisical_project_id\s*=\s*module\.infisical_project\.id/);
		expect(root).not.toMatch(/data "infisical_projects"/);
		expect(root).not.toMatch(/local\.(?:platforms|manifest)\.infisical\.(?:project_id|project_slug)/);
		expect(root).not.toMatch(/(?:workspace_id|project_id)\s*=\s*"[0-9a-f-]{36}"/);
	});
});
