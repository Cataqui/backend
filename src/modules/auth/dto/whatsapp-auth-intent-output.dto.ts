import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";

export class WhatsappAuthIntentOutputDto {
	constructor(params: { intentId: string; code: string; expiresAt: string }) {
		this.intentId = params.intentId;
		this.code = params.code;
		this.expiresAt = params.expiresAt;
	}

	@Expose({ name: "intent_id" })
	@ApiProperty({
		name: "intent_id",
		description: "Opaque identifier for checking this authentication intent in a future status endpoint.",
		format: "uuid",
		example: "5c474828-dd9e-4490-a45a-0e82512bc45e",
	})
	readonly intentId: string;

	@Expose({ name: "code" })
	@ApiProperty({
		name: "code",
		description: "Short-lived code to include unchanged in the user-initiated WhatsApp message.",
		example: "AUTH-K7F9Q2M8VD",
	})
	readonly code: string;

	@Expose({ name: "expires_at" })
	@ApiProperty({
		name: "expires_at",
		description: "ISO 8601 timestamp after which the authentication code is no longer valid.",
		format: "date-time",
		example: "2026-08-05T15:15:00.000Z",
	})
	readonly expiresAt: string;
}
