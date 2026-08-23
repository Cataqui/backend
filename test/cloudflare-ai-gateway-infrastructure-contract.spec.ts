import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const aiGatewayRootTerraformDirectory = resolve(process.cwd(), "infrastructure/cloudflare/ai-gateway");
const aiGatewayTerraformDirectories = [
	aiGatewayRootTerraformDirectory,
	resolve(process.cwd(), "infrastructure/cloudflare/modules/ai-gateway"),
];
const aiGatewayRootTerraformSource = readdirSync(aiGatewayRootTerraformDirectory)
	.filter((fileName) => fileName.endsWith(".tf"))
	.map((fileName) => readFileSync(resolve(aiGatewayRootTerraformDirectory, fileName), "utf8"))
	.join("\n");
const aiGatewayTerraformSource = aiGatewayTerraformDirectories
	.flatMap((terraformDirectory) =>
		readdirSync(terraformDirectory)
			.filter((fileName) => fileName.endsWith(".tf"))
			.map((fileName) => readFileSync(resolve(terraformDirectory, fileName), "utf8")),
	)
	.join("\n");
const cloudflareComponents = JSON.parse(
	readFileSync(resolve(process.cwd(), "infrastructure/cloudflare/components.json"), "utf8"),
) as string[];
const wranglerConfig = ts.readConfigFile(resolve(process.cwd(), "apps/api/wrangler.jsonc"), ts.sys.readFile).config as {
	env: Record<"staging" | "production", { vars: { CLOUDFLARE_AI_GATEWAY_ID: string } }>;
};

describe("Cloudflare AI Gateway infrastructure contract", () => {
	it("should commit the public account ID at the application root while keeping the module reusable", () => {
		expect({
			committedRootAccount: aiGatewayRootTerraformSource.includes(
				'cloudflare_account_id = "1fca946385505503c59dd6a2a4eeb442"',
			),
			rootUsesLocal:
				aiGatewayRootTerraformSource.includes("cloudflare_account_id = local.cloudflare_account_id") &&
				/id\s*=\s*"\$\{local\.cloudflare_account_id\}\/\$\{var\.environment\}"/.test(aiGatewayRootTerraformSource),
			rootDeclaresInput: aiGatewayRootTerraformSource.includes('variable "cloudflare_account_id"'),
			moduleDeclaresInput: readFileSync(
				resolve(process.cwd(), "infrastructure/cloudflare/modules/ai-gateway/variables.tf"),
				"utf8",
			).includes('variable "cloudflare_account_id"'),
		}).toEqual({
			committedRootAccount: true,
			rootUsesLocal: true,
			rootDeclaresInput: false,
			moduleDeclaresInput: true,
		});
	});

	it("should include AI Gateway in every environment's Terraform delivery lifecycle", () => {
		expect(cloudflareComponents).toContain("ai-gateway");
	});

	it.each(["staging", "production"] as const)(
		"should derive the %s AI Gateway ID from the Terraform environment",
		(environment) => {
			expect(wranglerConfig.env[environment].vars.CLOUDFLARE_AI_GATEWAY_ID).toBe(environment);
		},
	);

	it("should keep BYOK credentials outside Terraform state", () => {
		expect(aiGatewayTerraformSource).not.toMatch(/secrets_store|google_vertex|deepseek|provider_config/i);
	});

	it("should preserve the manually managed Secrets Store association", () => {
		expect(aiGatewayTerraformSource).toMatch(/ignore_changes\s*=\s*\[store_id\]/);
	});

	it("should validate every AI Gateway configuration through an exact typed module boundary", () => {
		expect(aiGatewayTerraformSource).toMatch(
			/type\s*=\s*object\([\s\S]*configuration_shape[\s\S]*must contain exactly the supported top-level AI Gateway fields/,
		);
	});
});
