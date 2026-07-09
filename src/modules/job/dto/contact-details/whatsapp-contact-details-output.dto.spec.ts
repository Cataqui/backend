import { instanceToPlain } from "class-transformer";
import { WhatsappContactDetailsOutputDto } from "./whatsapp-contact-details-output.dto";

describe("WhatsappContactDetailsOutputDto", () => {
	describe("getIdentifier", () => {
		it("should return the phone number", () => {
			const dto = new WhatsappContactDetailsOutputDto({ phoneNumber: "+5511999999999" });

			const result = dto.getIdentifier();

			expect(result).toBe("+5511999999999");
		});
	});

	describe("constructor", () => {
		it("should set phoneNumber", () => {
			const dto = new WhatsappContactDetailsOutputDto({ phoneNumber: "+5511999999999" });

			expect(dto.phoneNumber).toBe("+5511999999999");
		});
	});

	describe("serialization", () => {
		it("should serialize phone_number as snake_case", () => {
			const dto = new WhatsappContactDetailsOutputDto({ phoneNumber: "+5511999999999" });
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).toEqual({ phone_number: "+5511999999999" });
		});

		it("should not expose raw camelCase property names", () => {
			const dto = new WhatsappContactDetailsOutputDto({ phoneNumber: "+5511999999999" });
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).not.toHaveProperty("phoneNumber");
		});
	});
});
