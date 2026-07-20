import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { JobContactMethod } from "../../../../generated/prisma/client.js";
import { CreateJobContactInputDto } from "./create-job-contact-input.dto";

describe("CreateJobContactInputDto", () => {
	describe("validation", () => {
		it("should pass with valid WHATSAPP contact data", async () => {
			const dto = plainToInstance(CreateJobContactInputDto, {
				contact_method: JobContactMethod.WHATSAPP,
				identifier: "+5511999999999",
			});

			const errors = await validate(dto);

			expect(errors).toHaveLength(0);
		});

		it("should pass with valid PHONE_CALL contact data", async () => {
			const dto = plainToInstance(CreateJobContactInputDto, {
				contact_method: JobContactMethod.PHONE_CALL,
				identifier: "+5511999999999",
			});

			const errors = await validate(dto);

			expect(errors).toHaveLength(0);
		});

		it("should fail when identifier is missing", async () => {
			const dto = plainToInstance(CreateJobContactInputDto, {
				contact_method: JobContactMethod.WHATSAPP,
			});

			const errors = await validate(dto);

			expect(errors.length).toBeGreaterThan(0);
		});
	});
});
