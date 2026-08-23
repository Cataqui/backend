import { z } from "zod";

export const InboundMessageAuthIntentOutputSchema = z
	.object({
		intentToken: z
			.string()
			.regex(/^[A-Za-z0-9_-]{43}$/)
			.describe("Secret token required to poll and exchange this intent. It is shown only in this response."),
		code: z
			.string()
			.regex(/^AUTH-[A-Z0-9]{10}$/)
			.describe("Short-lived code to include unchanged in the user-initiated message."),
		codeReceiver: z.string().min(1).describe("Channel-specific destination that receives the authentication code."),
		expiresAt: z.iso.datetime().describe("Timestamp after which the authentication code is no longer valid."),
	})
	.strict()
	.meta({ id: "InboundMessageAuthIntentOutput" });
