import { z } from "zod";

export const AccountOutputSchema = z
	.object({
		accountId: z.uuid(),
		identities: z.array(
			z
				.object({
					identityId: z.uuid(),
					provider: z.literal("WHATSAPP"),
					identifier: z.string(),
					displayIdentifier: z.string(),
					lastVerifiedAt: z.iso.datetime(),
				})
				.strict(),
		),
	})
	.strict()
	.meta({ id: "AccountOutput" });
