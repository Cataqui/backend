import { z } from "zod";

export const MicroserviceAccessTokenHeaderSchema = z
	.object({
		alg: z.literal("ES256"),
		kid: z.string().min(1),
		typ: z.literal("microservice-access+jwt"),
	})
	.strict();
