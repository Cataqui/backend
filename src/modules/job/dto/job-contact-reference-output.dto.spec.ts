import { instanceToPlain } from "class-transformer";
import { JobContactMethod } from "../../../../generated/prisma/client.js";
import { JobContactReferenceOutputDto } from "./job-contact-reference-output.dto";

describe("JobContactReferenceOutputDto", () => {
	describe("constructor", () => {
		it("should set contactId and contactMethod", () => {
			const dto = new JobContactReferenceOutputDto({
				contactId: "cm3x-contact-1",
				contactMethod: JobContactMethod.WHATSAPP,
			});

			expect(dto.contactId).toBe("cm3x-contact-1");
		});

		it("should set PHONE_CALL contactMethod", () => {
			const dto = new JobContactReferenceOutputDto({
				contactId: "cm3x-contact-2",
				contactMethod: JobContactMethod.PHONE_CALL,
			});

			expect(dto.contactMethod).toBe(JobContactMethod.PHONE_CALL);
		});
	});

	describe("fromDatabase", () => {
		it("should create output DTO for WHATSAPP method", () => {
			const dto = JobContactReferenceOutputDto.fromDatabase({
				id: "cm3x-contact-1",
				contactMethod: JobContactMethod.WHATSAPP,
			});

			expect(dto.contactId).toBe("cm3x-contact-1");
			expect(dto.contactMethod).toBe(JobContactMethod.WHATSAPP);
		});

		it("should create output DTO for PHONE_CALL method", () => {
			const dto = JobContactReferenceOutputDto.fromDatabase({
				id: "cm3x-contact-2",
				contactMethod: JobContactMethod.PHONE_CALL,
			});

			expect(dto.contactId).toBe("cm3x-contact-2");
			expect(dto.contactMethod).toBe(JobContactMethod.PHONE_CALL);
		});
	});

	describe("serialization", () => {
		it("should serialize contact_id and contact_method as snake_case", () => {
			const dto = JobContactReferenceOutputDto.fromDatabase({
				id: "cm3x-contact-1",
				contactMethod: JobContactMethod.WHATSAPP,
			});
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).toHaveProperty("contact_id", "cm3x-contact-1");
			expect(plain).toHaveProperty("contact_method", "WHATSAPP");
		});

		it("should not expose raw camelCase property names", () => {
			const dto = JobContactReferenceOutputDto.fromDatabase({
				id: "cm3x-contact-1",
				contactMethod: JobContactMethod.WHATSAPP,
			});
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).not.toHaveProperty("contactId");
			expect(plain).not.toHaveProperty("contactMethod");
		});

		it("should not expose contact_details field", () => {
			const dto = JobContactReferenceOutputDto.fromDatabase({
				id: "cm3x-contact-1",
				contactMethod: JobContactMethod.WHATSAPP,
			});
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).not.toHaveProperty("contact_details");
		});
	});
});
