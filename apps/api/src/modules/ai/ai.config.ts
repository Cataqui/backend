import { registerAs } from "@nestjs/config";
import type { Env } from "../../core/config/env.schema";

export interface IAiConfig {
	cloudflareAccountId: string;
	aiGatewayApiToken: string;
	deriveJobDataAiGatewayId: string;
	environment: Env["NODE_ENV"];
}

export const aiConfig = registerAs(
	"ai",
	(): IAiConfig => ({
		cloudflareAccountId: process.env["CLOUDFLARE_ACCOUNT_ID"]!,
		aiGatewayApiToken: process.env["AI_GATEWAY_API_TOKEN"]!,
		deriveJobDataAiGatewayId: process.env["DERIVE_JOB_DATA_AI_GATEWAY_ID"]!,
		environment: process.env["NODE_ENV"] as IAiConfig["environment"],
	}),
);
