import { JobContactMethod } from "../../../../generated/prisma/client.js";
import { PhoneCallContactDetailsInputDto } from "../dto/contact-details/phone-call-contact-details-input.dto";
import { PhoneCallContactDetailsOutputDto } from "../dto/contact-details/phone-call-contact-details-output.dto";
import { WhatsappContactDetailsInputDto } from "../dto/contact-details/whatsapp-contact-details-input.dto";
import { WhatsappContactDetailsOutputDto } from "../dto/contact-details/whatsapp-contact-details-output.dto";
import { JobContactUtils } from "./job-contact.utils";

describe("JobContactUtils", () => {
	describe("buildDetailsOutputDto", () => {
		it("should return a WhatsappContactDetailsOutputDto for WHATSAPP", () => {
			const result = JobContactUtils.buildDetailsOutputDto(JobContactMethod.WHATSAPP, "+5511999999999");

			expect(result).toBeInstanceOf(WhatsappContactDetailsOutputDto);
		});

		it("should set the correct phone number for WHATSAPP", () => {
			const result = JobContactUtils.buildDetailsOutputDto(JobContactMethod.WHATSAPP, "+5511999999999");

			expect(result.phoneNumber).toBe("+5511999999999");
		});

		it("should return a PhoneCallContactDetailsOutputDto for PHONE_CALL", () => {
			const result = JobContactUtils.buildDetailsOutputDto(JobContactMethod.PHONE_CALL, "+5511888888888");

			expect(result).toBeInstanceOf(PhoneCallContactDetailsOutputDto);
		});

		it("should set the correct phone number for PHONE_CALL", () => {
			const result = JobContactUtils.buildDetailsOutputDto(JobContactMethod.PHONE_CALL, "+5511888888888");

			expect(result.phoneNumber).toBe("+5511888888888");
		});

		it("should handle all JobContactMethod values (exhaustive)", () => {
			const methods = Object.values(JobContactMethod);

			const results = methods.map((method) => JobContactUtils.buildDetailsOutputDto(method, "+5511999999999"));

			expect(results).toHaveLength(methods.length);
		});
	});

	describe("instantiateContactDetailsInput", () => {
		it("should return a WhatsappContactDetailsInputDto for WHATSAPP", () => {
			const result = JobContactUtils.instantiateDetailsInput({
				contact_method: JobContactMethod.WHATSAPP,
				contact_details: { phone_number: "+5511999999999" },
			});

			expect(result).toBeInstanceOf(WhatsappContactDetailsInputDto);
		});

		it("should set the correct phone number for WHATSAPP", () => {
			const result = JobContactUtils.instantiateDetailsInput({
				contact_method: JobContactMethod.WHATSAPP,
				contact_details: { phone_number: "+5511999999999" },
			}) as WhatsappContactDetailsInputDto;

			expect(result.phoneNumber).toBe("+5511999999999");
		});

		it("should return a PhoneCallContactDetailsInputDto for PHONE_CALL", () => {
			const result = JobContactUtils.instantiateDetailsInput({
				contact_method: JobContactMethod.PHONE_CALL,
				contact_details: { phone_number: "+5511888888888" },
			});

			expect(result).toBeInstanceOf(PhoneCallContactDetailsInputDto);
		});

		it("should return an empty object for an unknown method", () => {
			const result = JobContactUtils.instantiateDetailsInput({
				contact_method: "UNKNOWN",
				contact_details: { phone_number: "+5511999999999" },
			});

			expect(result).toEqual({});
		});

		it("should return an empty object when method is missing", () => {
			const result = JobContactUtils.instantiateDetailsInput({
				contact_details: { phone_number: "+5511999999999" },
			});

			expect(result).toEqual({});
		});

		it("should return an empty object when contact_details is an array", () => {
			const result = JobContactUtils.instantiateDetailsInput({
				contact_method: JobContactMethod.WHATSAPP,
				contact_details: [],
			});

			expect(result).toEqual({});
		});

		it("should return an empty object when contact_details is a string", () => {
			const result = JobContactUtils.instantiateDetailsInput({
				contact_method: JobContactMethod.WHATSAPP,
				contact_details: "not-an-object",
			});

			expect(result).toEqual({});
		});

		it("should return an empty object when contact_details is null", () => {
			const result = JobContactUtils.instantiateDetailsInput({
				contact_method: JobContactMethod.WHATSAPP,
				contact_details: null,
			});

			expect(result).toEqual({});
		});
	});
});
