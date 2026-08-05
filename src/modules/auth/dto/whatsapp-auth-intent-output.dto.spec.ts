import { instanceToPlain } from "class-transformer";
import { WhatsappAuthIntentOutputDto } from "./whatsapp-auth-intent-output.dto";

describe("WhatsAppAuthIntentOutputDto", () => {
	it("should serialize the public authentication intent using snake_case", () => {
		const dto = new WhatsappAuthIntentOutputDto({
			intentId: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			code: "AUTH-K7F9Q2M8VD",
			expiresAt: "2026-08-05T15:15:00.000Z",
		});

		expect(instanceToPlain(dto)).toEqual({
			intent_id: "5c474828-dd9e-4490-a45a-0e82512bc45e",
			code: "AUTH-K7F9Q2M8VD",
			expires_at: "2026-08-05T15:15:00.000Z",
		});
	});
});
