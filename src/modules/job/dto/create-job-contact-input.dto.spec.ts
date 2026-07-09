import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { JobContactMethod } from "../../../../generated/prisma/client.js";
import { CreateJobContactInputDto } from "./create-job-contact-input.dto";
import { WhatsappContactDetailsInputDto } from "./contact-details/whatsapp-contact-details-input.dto";
import { PhoneCallContactDetailsInputDto } from "./contact-details/phone-call-contact-details-input.dto";

describe("CreateJobContactInputDto", () => {
	describe("validation", () => {
		it("should pass with valid WHATSAPP contact data", async () => {
			const dto = plainToInstance(CreateJobContactInputDto, {
				contact_method: JobContactMethod.WHATSAPP,
				contact_details: { phone_number: "+5511999999999" },
			});

			const errors = await validate(dto);

			expect(errors).toHaveLength(0);
		});

		it("should pass with valid PHONE_CALL contact data", async () => {
			const dto = plainToInstance(CreateJobContactInputDto, {
				contact_method: JobContactMethod.PHONE_CALL,
				contact_details: { phone_number: "+5511999999999" },
			});

			const errors = await validate(dto);

			expect(errors).toHaveLength(0);
		});

		it("should instantiate the correct details DTO for WHATSAPP", async () => {
			const dto = plainToInstance(CreateJobContactInputDto, {
				contact_method: JobContactMethod.WHATSAPP,
				contact_details: { phone_number: "+5511999999999" },
			});

			expect(dto.contactDetails).toBeInstanceOf(WhatsappContactDetailsInputDto);
		});

		it("should instantiate the correct details DTO for PHONE_CALL", async () => {
			const dto = plainToInstance(CreateJobContactInputDto, {
				contact_method: JobContactMethod.PHONE_CALL,
				contact_details: { phone_number: "+5511999999999" },
			});

			expect(dto.contactDetails).toBeInstanceOf(PhoneCallContactDetailsInputDto);
		});

		it("should fail when details phone number is invalid", async () => {
			const dto = plainToInstance(CreateJobContactInputDto, {
				contact_method: JobContactMethod.WHATSAPP,
				contact_details: { phone_number: "invalid" },
			});

			const errors = await validate(dto);

			expect(errors.length).toBeGreaterThan(0);
		});

		it("should fail with an invalid contact method", async () => {
			const dto = plainToInstance(CreateJobContactInputDto, {
				contact_method: "INVALID",
				contact_details: { phone_number: "+5511999999999" },
			});

			const errors = await validate(dto);

			expect(errors.length).toBeGreaterThan(0);
		});

		it("should fail when contact_details is an array", async () => {
			const dto = plainToInstance(CreateJobContactInputDto, {
				contact_method: JobContactMethod.WHATSAPP,
				contact_details: [],
			});

			const errors = await validate(dto);

			expect(errors.length).toBeGreaterThan(0);
		});

		it("should fail when contact_details is missing", async () => {
			const dto = plainToInstance(CreateJobContactInputDto, {
				contact_method: JobContactMethod.WHATSAPP,
			});

			const errors = await validate(dto);

			expect(errors.length).toBeGreaterThan(0);
		});

		it("should fail with extra fields in contact_details (forbidNonWhitelisted)", async () => {
			const dto = plainToInstance(CreateJobContactInputDto, {
				contact_method: JobContactMethod.WHATSAPP,
				contact_details: {
					phone_number: "+5511999999999",
					extra_field: "should not be allowed",
				},
			});

			const errors = await validate(dto, { forbidNonWhitelisted: true, whitelist: true });

			expect(errors.length).toBeGreaterThan(0);
		});
	});
});
