import { registerAs } from "@nestjs/config";

export interface IRedisConfig {
	caCertificate?: string;
	password: string;
	url: string;
	username: string;
}

export const redisConfig = registerAs(
	"redis",
	(): IRedisConfig => ({
		...(process.env["REDIS_CA_CERT_BASE64"] === undefined
			? {}
			: { caCertificate: Buffer.from(process.env["REDIS_CA_CERT_BASE64"], "base64").toString("utf8") }),
		password: process.env["REDIS_PASSWORD"]!,
		url: process.env["REDIS_URL"]!,
		username: process.env["REDIS_USERNAME"]!,
	}),
);
