import { instanceToPlain } from "class-transformer";
import { JobContactOutputDto } from "./job-contact-output.dto";
import { ContactMethod } from "../../../../generated/prisma/client.js";

describe("JobContactOutputDto", () => {
	describe("constructor", () => {
		it("should set name, phoneNumber, and method", () => {
			const dto = new JobContactOutputDto({ contactName: "João Silva", contactPhoneNumber: "+5511999999999", contactMethod: ContactMethod.WHATSAPP });

			expect(dto.name).toBe("João Silva");
			expect(dto.phoneNumber).toBe("+5511999999999");
			expect(dto.method).toBe(ContactMethod.WHATSAPP);
		});

		it("should accept PHONE_CALL method", () => {
			const dto = new JobContactOutputDto({ contactName: "Maria", contactPhoneNumber: "+5511888888888", contactMethod: ContactMethod.PHONE_CALL });

			expect(dto.method).toBe(ContactMethod.PHONE_CALL);
		});
	});

	describe("serialization", () => {
		it("should serialize name, phone_number, contact_method as snake_case", () => {
			const dto = new JobContactOutputDto({ contactName: "João Silva", contactPhoneNumber: "+5511999999999", contactMethod: ContactMethod.WHATSAPP });
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).toEqual({
				name: "João Silva",
				phone_number: "+5511999999999",
				contact_method: "WHATSAPP",
			});
		});

		it("should not expose raw camelCase property names", () => {
			const dto = new JobContactOutputDto({ contactName: "João Silva", contactPhoneNumber: "+5511999999999", contactMethod: ContactMethod.WHATSAPP });
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).not.toHaveProperty("phoneNumber");
			expect(plain).not.toHaveProperty("method");
		});

		it("should not include whatsapp_url", () => {
			const dto = new JobContactOutputDto({ contactName: "João Silva", contactPhoneNumber: "+5511999999999", contactMethod: ContactMethod.WHATSAPP });
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).not.toHaveProperty("whatsapp_url");
		});
	});
});
