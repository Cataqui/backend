import { registerAs } from "@nestjs/config";

export const MAP_AUTH_CONFIG_KEY = "mapAuth";

export interface IMapAuthConfig {
	authSecret: string;
	protomapUrl: string;
}

export const mapAuthConfig = registerAs(
	MAP_AUTH_CONFIG_KEY,
	(): IMapAuthConfig => ({
		authSecret: process.env["PROTOMAP_AUTH_SECRET"]!,
		protomapUrl: process.env["PROTOMAP_URL"]!,
	}),
);
