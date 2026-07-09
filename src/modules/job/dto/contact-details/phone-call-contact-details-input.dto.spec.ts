import { validate } from "class-validator";
import { PhoneCallContactDetailsInputDto } from "./phone-call-contact-details-input.dto";

describe("PhoneCallContactDetailsInputDto", () => {
	describe("getIdentifier", () => {
		it("should return the phone number", () => {
			const dto = new PhoneCallContactDetailsInputDto();
			(dto as { phoneNumber: string }).phoneNumber = "+5511888888888";

			const result = dto.getIdentifier();

			expect(result).toBe("+5511888888888");
		});
	});

	describe("validation", () => {
		it("should pass with a valid phone number", async () => {
			const dto = new PhoneCallContactDetailsInputDto();
			(dto as { phoneNumber: string }).phoneNumber = "+5511999999999";

			const errors = await validate(dto);

			expect(errors).toHaveLength(0);
		});

		it("should fail with an empty phone number", async () => {
			const dto = new PhoneCallContactDetailsInputDto();
			(dto as { phoneNumber: string }).phoneNumber = "";

			const errors = await validate(dto);

			expect(errors).toHaveLength(1);
		});

		it("should fail with an invalid phone number", async () => {
			const dto = new PhoneCallContactDetailsInputDto();
			(dto as { phoneNumber: string }).phoneNumber = "123";

			const errors = await validate(dto);

			expect(errors).toHaveLength(1);
		});
	});
});
