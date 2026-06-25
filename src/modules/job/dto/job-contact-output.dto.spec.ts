import { instanceToPlain } from "class-transformer";
import { JobContactMethod } from "../../../../generated/prisma/client.js";
import { JobContactOutputDto } from "./job-contact-output.dto";

describe("JobContactOutputDto", () => {
	describe("constructor", () => {
		it("should set phoneNumber and method", () => {
			const dto = new JobContactOutputDto({
				contactPhoneNumber: "+5511999999999",
				contactMethod: JobContactMethod.WHATSAPP,
			});

			expect(dto.phoneNumber).toBe("+5511999999999");
			expect(dto.method).toBe(JobContactMethod.WHATSAPP);
		});

		it("should accept PHONE_CALL method", () => {
			const dto = new JobContactOutputDto({
				contactPhoneNumber: "+5511888888888",
				contactMethod: JobContactMethod.PHONE_CALL,
			});

			expect(dto.method).toBe(JobContactMethod.PHONE_CALL);
		});
	});

	describe("serialization", () => {
		it("should serialize phone_number and contact_method as snake_case", () => {
			const dto = new JobContactOutputDto({
				contactPhoneNumber: "+5511999999999",
				contactMethod: JobContactMethod.WHATSAPP,
			});
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).toEqual({
				phone_number: "+5511999999999",
				contact_method: "WHATSAPP",
			});
		});

		it("should not expose raw camelCase property names", () => {
			const dto = new JobContactOutputDto({
				contactPhoneNumber: "+5511999999999",
				contactMethod: JobContactMethod.WHATSAPP,
			});
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).not.toHaveProperty("phoneNumber");
			expect(plain).not.toHaveProperty("method");
		});

		it("should not include whatsapp_url or name", () => {
			const dto = new JobContactOutputDto({
				contactPhoneNumber: "+5511999999999",
				contactMethod: JobContactMethod.WHATSAPP,
			});
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).not.toHaveProperty("whatsapp_url");
			expect(plain).not.toHaveProperty("name");
		});
	});
});
