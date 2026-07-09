import { instanceToPlain } from "class-transformer";
import { JobContactMethod } from "../../../../generated/prisma/client.js";
import { JobContactOutputDto } from "./job-contact-output.dto";

describe("JobContactOutputDto", () => {
	describe("constructor", () => {
		it("should set contactMethod and contactDetails", () => {
			const details = JobContactOutputDto.fromDatabase({
				contactMethod: JobContactMethod.WHATSAPP,
				identifier: "+5511999999999",
			}).contactDetails;
			const dto = new JobContactOutputDto({
				contactMethod: JobContactMethod.WHATSAPP,
				contactDetails: details,
			});

			expect(dto.contactMethod).toBe(JobContactMethod.WHATSAPP);
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

		it("should create output DTO for PHONE_CALL method", () => {
			const dto = JobContactOutputDto.fromDatabase({
				contactMethod: JobContactMethod.PHONE_CALL,
				identifier: "+5511888888888",
			});

			expect(dto.contactMethod).toBe(JobContactMethod.PHONE_CALL);
		});
	});

	describe("serialization", () => {
		it("should serialize contact_method and nested contact_details as snake_case", () => {
			const dto = JobContactOutputDto.fromDatabase({
				contactMethod: JobContactMethod.WHATSAPP,
				identifier: "+5511999999999",
			});
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).toHaveProperty("contact_method", "WHATSAPP");
			expect(plain).toHaveProperty("contact_details");
			expect((plain["contact_details"] as Record<string, unknown>)["phone_number"]).toBe("+5511999999999");
		});

		it("should not expose raw camelCase property names", () => {
			const dto = JobContactOutputDto.fromDatabase({
				contactMethod: JobContactMethod.WHATSAPP,
				identifier: "+5511999999999",
			});
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).not.toHaveProperty("contactMethod");
		});

		it("should serialize PHONE_CALL contact details", () => {
			const dto = JobContactOutputDto.fromDatabase({
				contactMethod: JobContactMethod.PHONE_CALL,
				identifier: "+5511888888888",
			});
			const plain = instanceToPlain(dto) as Record<string, unknown>;
			const details = plain["contact_details"] as Record<string, unknown>;

			expect(plain).toHaveProperty("contact_method", "PHONE_CALL");
			expect(details["phone_number"]).toBe("+5511888888888");
		});
	});
});
