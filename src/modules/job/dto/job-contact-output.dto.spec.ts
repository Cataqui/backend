import { instanceToPlain } from "class-transformer";
import { JobContactMethod } from "../../../../generated/prisma/client.js";
import { JobContactOutputDto } from "./job-contact-output.dto";

describe("JobContactOutputDto", () => {
	describe("constructor", () => {
		it("should set contactMethod and identifier", () => {
			const dto = new JobContactOutputDto({
				contactMethod: JobContactMethod.WHATSAPP,
				identifier: "+5511999999999",
			});

			expect(dto.contactMethod).toBe(JobContactMethod.WHATSAPP);
		});

		it("should set identifier from constructor", () => {
			const dto = new JobContactOutputDto({
				contactMethod: JobContactMethod.WHATSAPP,
				identifier: "+5511999999999",
			});

			expect(dto.identifier).toBe("+5511999999999");
		});
	});

	describe("fromDatabase", () => {
		it("should create output DTO for WHATSAPP method", () => {
			const dto = JobContactOutputDto.fromDatabase({
				contactMethod: JobContactMethod.WHATSAPP,
				identifier: "+5511999999999",
			});

			expect(dto.contactMethod).toBe(JobContactMethod.WHATSAPP);
		});

		it("should pass identifier through fromDatabase", () => {
			const dto = JobContactOutputDto.fromDatabase({
				contactMethod: JobContactMethod.WHATSAPP,
				identifier: "+5511999999999",
			});

			expect(dto.identifier).toBe("+5511999999999");
		});

		it("should create output DTO for PHONE_CALL method", () => {
			const dto = JobContactOutputDto.fromDatabase({
				contactMethod: JobContactMethod.PHONE_CALL,
				identifier: "+5511888888888",
			});

			expect(dto.contactMethod).toBe(JobContactMethod.PHONE_CALL);
		});
	});

	describe("serialization", () => {
		it("should serialize contact_method and identifier as snake_case", () => {
			const dto = JobContactOutputDto.fromDatabase({
				contactMethod: JobContactMethod.WHATSAPP,
				identifier: "+5511999999999",
			});
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).toHaveProperty("contact_method", "WHATSAPP");
			expect(plain).toHaveProperty("identifier", "+5511999999999");
		});

		it("should not expose raw camelCase property names", () => {
			const dto = JobContactOutputDto.fromDatabase({
				contactMethod: JobContactMethod.WHATSAPP,
				identifier: "+5511999999999",
			});
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).not.toHaveProperty("contactMethod");
		});

		it("should not expose nested contact_details field", () => {
			const dto = JobContactOutputDto.fromDatabase({
				contactMethod: JobContactMethod.PHONE_CALL,
				identifier: "+5511888888888",
			});
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).not.toHaveProperty("contact_details");
		});
	});
});
