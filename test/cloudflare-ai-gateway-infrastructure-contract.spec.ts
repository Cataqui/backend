import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const aiGatewayTerraformDirectories = [
	resolve(process.cwd(), "infra/cloudflare/ai-gateway"),
	resolve(process.cwd(), "infra/cloudflare/modules/ai-gateway"),
];
const aiGatewayTerraformSource = aiGatewayTerraformDirectories
	.flatMap((terraformDirectory) =>
		readdirSync(terraformDirectory)
			.filter((fileName) => fileName.endsWith(".tf"))
			.map((fileName) => readFileSync(resolve(terraformDirectory, fileName), "utf8")),
	)
	.join("\n");
const cloudflareComponents = JSON.parse(
	readFileSync(resolve(process.cwd(), "infra/cloudflare/components.json"), "utf8"),
) as string[];
const wranglerConfig = ts.readConfigFile(
	resolve(process.cwd(), "src/platform/cloudflare/workers/api/wrangler.jsonc"),
	ts.sys.readFile,
).config as {
	env: Record<"staging" | "production", { vars: { CLOUDFLARE_AI_GATEWAY_ID: string } }>;
};

describe("Cloudflare AI Gateway infrastructure contract", () => {
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
