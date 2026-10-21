import { registerAs } from "@nestjs/config";
import { EnvSchema, type Env } from "./env.schema";

export interface RuntimeConfig {
	environment: Env["ENVIRONMENT"];
}

export const runtimeConfig = registerAs(
	"runtime",
	(): RuntimeConfig => ({
		environment: EnvSchema.shape.ENVIRONMENT.parse(process.env["ENVIRONMENT"]),
	}),
);
