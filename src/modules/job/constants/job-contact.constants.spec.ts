import { JobContactMethod } from "../../../../generated/prisma/client.js";
import { PhoneCallContactDetailsInputDto } from "../dto/contact-details/phone-call-contact-details-input.dto.js";
import { WhatsappContactDetailsInputDto } from "../dto/contact-details/whatsapp-contact-details-input.dto.js";
import { JobContactConstants } from "./job-contact.constants.js";

describe("JobContactConstants", () => {
	describe("CONTACT_DETAILS_INPUT_CLASS_BY_METHOD", () => {
		it("should return WhatsappContactDetailsInputDto for WHATSAPP", () => {
			const DtoClass = JobContactConstants.CONTACT_DETAILS_INPUT_DTO_BY_METHOD[JobContactMethod.WHATSAPP];

			expect(DtoClass).toBe(WhatsappContactDetailsInputDto);
		});

		it("should return PhoneCallContactDetailsInputDto for PHONE_CALL", () => {
			const DtoClass = JobContactConstants.CONTACT_DETAILS_INPUT_DTO_BY_METHOD[JobContactMethod.PHONE_CALL];

			expect(DtoClass).toBe(PhoneCallContactDetailsInputDto);
		});

		it("should have entries for all JobContactMethod values", () => {
			const methods = Object.keys(JobContactConstants.CONTACT_DETAILS_INPUT_DTO_BY_METHOD);
			const enumValues = Object.values(JobContactMethod);

			expect(methods.sort()).toEqual(enumValues.sort());
		});
	});

	describe("CONTACT_DETAILS_OUTPUT_BUILDER_BY_METHOD", () => {
		it("should build a WhatsappContactDetailsOutputDto for WHATSAPP", () => {
			const result =
				JobContactConstants.CONTACT_DETAILS_OUTPUT_DTO_BUILDER_BY_METHOD[JobContactMethod.WHATSAPP]("+5511999999999");

			expect(result.phoneNumber).toBe("+5511999999999");
		});

		it("should build a PhoneCallContactDetailsOutputDto for PHONE_CALL", () => {
			const result =
				JobContactConstants.CONTACT_DETAILS_OUTPUT_DTO_BUILDER_BY_METHOD[JobContactMethod.PHONE_CALL]("+5511888888888");

			expect(result.phoneNumber).toBe("+5511888888888");
		});

		it("should have entries for all JobContactMethod values", () => {
			const methods = Object.keys(JobContactConstants.CONTACT_DETAILS_OUTPUT_DTO_BUILDER_BY_METHOD);
			const enumValues = Object.values(JobContactMethod);

			expect(methods.sort()).toEqual(enumValues.sort());
		});
	});
});
