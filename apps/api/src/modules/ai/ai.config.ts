import { registerAs } from "@nestjs/config";

export interface IAiConfig {
	cloudflareAccountId: string;
	aiGatewayApiToken: string;
	deriveJobDataAiGatewayId: string;
}

export const aiConfig = registerAs(
	"ai",
	(): IAiConfig => ({
		cloudflareAccountId: process.env["CLOUDFLARE_ACCOUNT_ID"]!,
		aiGatewayApiToken: process.env["AI_GATEWAY_API_TOKEN"]!,
		deriveJobDataAiGatewayId: process.env["DERIVE_JOB_DATA_AI_GATEWAY_ID"]!,
	}),
);
