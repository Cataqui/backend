import { isValidPhoneNumber } from "libphonenumber-js";
import { z } from "zod";
import { ContactMethod } from "../../../../generated/prisma/client";

function _createContactIdentifierSchema(): z.ZodString {
	return z
		.string()
		.trim()
		.min(1, { error: "contact identifier must not be empty" })
		.describe("Contact identifier for the selected contact method");
}

export const ContactInputSchema = z
	.discriminatedUnion("method", [
		z
			.object({
				method: z.literal(ContactMethod.WHATSAPP).describe("WhatsApp contact method"),
				identifier: _createContactIdentifierSchema().refine(
					(identifier) => {
						if (isValidPhoneNumber(identifier)) return true;

						const whatsappUsername = identifier.startsWith("@") ? identifier.slice(1) : identifier;

						return (
							whatsappUsername.length >= 3 &&
							whatsappUsername.length <= 35 &&
							/[a-z]/iu.test(whatsappUsername) &&
							/^[a-z0-9._]+$/iu.test(whatsappUsername)
						);
					},
					{
						error:
							"identifier for WHATSAPP must be an international phone number such as +5511999999999 or a WhatsApp username such as @cataqui.poster",
					},
				),
			})
			.strict(),
		z
			.object({
				method: z.literal(ContactMethod.PHONE_CALL).describe("Phone-call contact method"),
				identifier: _createContactIdentifierSchema().refine((identifier) => isValidPhoneNumber(identifier), {
					error:
						"identifier for PHONE_CALL must be a phone number with country code, starting with + followed by the country and local number. Example: +5511999999999",
				}),
			})
			.strict(),
	])
	.meta({ id: "ContactInput" });
