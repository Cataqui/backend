import { ContactMethod } from "../../../../generated/prisma/client";
import { ContactInputSchema } from "./contact-input.schema";

describe("ContactInputSchema", () => {
	describe("validation", () => {
		it("should pass with valid WHATSAPP contact data", () => {
			expect(
				ContactInputSchema.safeParse({
					method: ContactMethod.WHATSAPP,
					identifier: "+5511999999999",
				}).success,
			).toBe(true);
		});

		it("should pass with valid PHONE_CALL contact data", () => {
			expect(
				ContactInputSchema.safeParse({
					method: ContactMethod.PHONE_CALL,
					identifier: "+5511999999999",
				}).success,
			).toBe(true);
		});

		it("should accept a WhatsApp username with an at-sign", () => {
			expect(
				ContactInputSchema.safeParse({
					method: ContactMethod.WHATSAPP,
					identifier: "@cataqui.poster",
				}).success,
			).toBe(true);
		});

		it("should accept a WhatsApp username without an at-sign", () => {
			expect(
				ContactInputSchema.safeParse({
					method: ContactMethod.WHATSAPP,
					identifier: "cataqui_poster",
				}).success,
			).toBe(true);
		});

		it("should reject a WhatsApp username for phone calls", () => {
			expect(
				ContactInputSchema.safeParse({
					method: ContactMethod.PHONE_CALL,
					identifier: "@cataqui.poster",
				}).success,
			).toBe(false);
		});

		it("should reject a valid phone number for an unsupported contact method", () => {
			expect(
				ContactInputSchema.safeParse({
					method: "EMAIL",
					identifier: "+5511999999999",
				}).success,
			).toBe(false);
		});

		it("should reject a WhatsApp username shorter than three characters", () => {
			expect(
				ContactInputSchema.safeParse({
					method: ContactMethod.WHATSAPP,
					identifier: "@ab",
				}).success,
			).toBe(false);
		});

		it("should reject a WhatsApp username longer than thirty-five characters", () => {
			expect(
				ContactInputSchema.safeParse({
					method: ContactMethod.WHATSAPP,
					identifier: `@${"a".repeat(36)}`,
				}).success,
			).toBe(false);
		});

		it("should reject a WhatsApp username without a letter", () => {
			expect(
				ContactInputSchema.safeParse({
					method: ContactMethod.WHATSAPP,
					identifier: "@12345",
				}).success,
			).toBe(false);
		});

		it("should reject a WhatsApp username containing unsupported characters", () => {
			expect(
				ContactInputSchema.safeParse({
					method: ContactMethod.WHATSAPP,
					identifier: "@cataqui-poster",
				}).success,
			).toBe(false);
		});

		it("should fail when identifier is missing", () => {
			expect(ContactInputSchema.safeParse({ method: ContactMethod.WHATSAPP }).success).toBe(false);
		});

		it("should reject an identifier that is neither a WhatsApp username nor an international phone number", () => {
			expect(
				ContactInputSchema.safeParse({
					method: ContactMethod.WHATSAPP,
					identifier: "not-a-phone-number",
				}).success,
			).toBe(false);
		});
	});
});
