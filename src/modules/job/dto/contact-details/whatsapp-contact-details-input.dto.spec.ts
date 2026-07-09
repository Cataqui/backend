import { validate } from "class-validator";
import { WhatsappContactDetailsInputDto } from "./whatsapp-contact-details-input.dto";

describe("WhatsappContactDetailsInputDto", () => {
	describe("getIdentifier", () => {
		it("should return the phone number", () => {
			const dto = new WhatsappContactDetailsInputDto();
			(dto as { phoneNumber: string }).phoneNumber = "+5511999999999";

			const result = dto.getIdentifier();

			expect(result).toBe("+5511999999999");
		});
	});

	describe("validation", () => {
		it("should pass with a valid phone number", async () => {
			const dto = new WhatsappContactDetailsInputDto();
			(dto as { phoneNumber: string }).phoneNumber = "+5511999999999";

			const errors = await validate(dto);

			expect(errors).toHaveLength(0);
		});

		it("should fail with an empty phone number", async () => {
			const dto = new WhatsappContactDetailsInputDto();
			(dto as { phoneNumber: string }).phoneNumber = "";

			const errors = await validate(dto);

			expect(errors).toHaveLength(1);
		});

		it("should fail with an invalid phone number", async () => {
			const dto = new WhatsappContactDetailsInputDto();
			(dto as { phoneNumber: string }).phoneNumber = "123";

			const errors = await validate(dto);

			expect(errors).toHaveLength(1);
		});
	});
});
