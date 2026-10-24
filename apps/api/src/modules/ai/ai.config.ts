import { registerAs } from "@nestjs/config";

export interface IAiConfig {
	cloudflareAccountId: string;
	aiGatewayApiToken: string;
	aiGatewayId: string;
}

export const aiConfig = registerAs(
	"ai",
	(): IAiConfig => ({
		cloudflareAccountId: process.env["CLOUDFLARE_ACCOUNT_ID"]!,
		aiGatewayApiToken: process.env["AI_GATEWAY_API_TOKEN"]!,
		aiGatewayId: process.env["AI_GATEWAY_ID"]!,
	}),
);
