import { z } from "zod";
import { MicroservicesAuthPublicJwkOutputSchema } from "./microservices-auth-public-jwk-output.schema.js";

export const MicroservicesAuthJwksOutputSchema = z
	.object({
		keys: z
			.array(MicroservicesAuthPublicJwkOutputSchema)
			.min(1)
			.superRefine((keys, context) => {
				const keyIds = new Set<string>();

				for (const [keyIndex, key] of keys.entries()) {
					if (!keyIds.has(key.kid)) {
						keyIds.add(key.kid);
						continue;
					}

					context.addIssue({
						code: "custom",
						message: "Public JWK key IDs must be unique",
						path: [keyIndex, "kid"],
					});
				}
			})
			.readonly(),
	})
	.strict()
	.readonly()
	.meta({ id: "MicroservicesAuthJwksOutput" });
