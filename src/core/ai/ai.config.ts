import { registerAs } from "@nestjs/config";

export const AI_CONFIG_KEY = "ai";

export interface IAiConfig {
	cloudflareAccountId: string;
	aiApiToken: string;
	cloudflareAiGatewayId: string;
}

export const aiConfig = registerAs(
	AI_CONFIG_KEY,
	(): IAiConfig => ({
		cloudflareAccountId: process.env["CLOUDFLARE_ACCOUNT_ID"]!,
		aiApiToken: process.env["AI_GATEWAY_API_TOKEN"]!,
		cloudflareAiGatewayId: process.env["CLOUDFLARE_AI_GATEWAY_ID"]!,
	}),
);
