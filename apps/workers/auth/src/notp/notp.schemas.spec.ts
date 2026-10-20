import type { z } from "zod";
import { CreateNotpIntentInputSchema } from "./create-notp-intent-input.schema";
import { ExchangeNotpIntentInputSchema } from "./exchange-notp-intent-input.schema";
import { NotpChannel } from "./notp-channel.enum";
import { NotpIntentExchangeOutputSchema } from "./notp-intent-exchange-output.schema";
import { NotpIntentOutputSchema } from "./notp-intent-output.schema";
import { NotpIntentPendingOutputSchema } from "./notp-intent-pending-output.schema";
import { NotpIntentStatus } from "./notp-intent-status.enum";

describe("NOTP schemas", () => {
	it("accepts WhatsApp intents and rejects unsupported channels and extra fields", () => {
		expect(CreateNotpIntentInputSchema.parse({ channel: "WHATSAPP" })).toEqual({ channel: NotpChannel.WHATSAPP });
		expect(CreateNotpIntentInputSchema.safeParse({ channel: "EMAIL" }).success).toBe(false);
		expect(CreateNotpIntentInputSchema.safeParse({ channel: "WHATSAPP", accountId: "spoofed" }).success).toBe(false);
	});
	it("requires the exact secret intent-token format at ingress", () => {
		expect(ExchangeNotpIntentInputSchema.parse({ intentToken: "a".repeat(43) })).toEqual({
			intentToken: "a".repeat(43),
		});
		expect(ExchangeNotpIntentInputSchema.safeParse({ intentToken: "too-short" }).success).toBe(false);
		expect(ExchangeNotpIntentInputSchema.safeParse({ intentToken: "a".repeat(42) + "/" }).success).toBe(false);
	});
	it("defines the public intent's receiver, credentials, and expiry", () => {
		const intent = {
			intentToken: "a".repeat(43),
			code: "NOTP-ABCDEF1234",
			codeReceiver: "+5511999999999",
			expiresAt: "2026-10-19T15:15:00.000Z",
		} satisfies z.infer<typeof NotpIntentOutputSchema>;
		expect(NotpIntentOutputSchema.parse(intent)).toEqual(intent);
	});
	it("accepts pending and issued-session outcomes", () => {
		const pending = { status: NotpIntentStatus.PENDING, retryAfterSeconds: 1 } satisfies z.infer<
			typeof NotpIntentPendingOutputSchema
		>;
		const session = {
			accessToken: "a".repeat(43),
			tokenType: "Bearer",
			expiresAt: "2026-10-19T15:15:00.000Z",
			refreshToken: "refresh",
			refreshExpiresAt: "2026-11-18T15:00:00.000Z",
			accountId: "ac15fc2f-f58f-4962-8593-dd05d8e89ecd",
		} satisfies z.infer<typeof NotpIntentExchangeOutputSchema>;
		expect(NotpIntentPendingOutputSchema.parse(pending)).toEqual(pending);
		expect(NotpIntentExchangeOutputSchema.parse(pending)).toEqual(pending);
		expect(NotpIntentExchangeOutputSchema.parse(session)).toEqual(session);
	});
});
