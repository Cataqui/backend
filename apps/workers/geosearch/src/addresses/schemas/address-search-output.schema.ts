import { z } from "zod";
import { AddressCategory } from "../address-category.enum";

export const AddressSearchOutputSchema = z
	.object({
		suggestions: z.array(
			z
				.object({
					addressId: z.string().min(1),
					fullText: z.string().min(1),
					primaryText: z.string().min(1),
					secondaryText: z.string().min(1).nullable(),
					category: z.enum(AddressCategory),
				})
				.strict(),
		),
		attribution: z
			.object({
				text: z.string().min(1),
			})
			.strict(),
	})
	.strict();
