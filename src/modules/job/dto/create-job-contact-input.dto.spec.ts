import { validate } from "class-validator";
import { JobContactMethod } from "../../../../generated/prisma/client.js";
import { CreateJobContactInputDto } from "./create-job-contact-input.dto";

describe("CreateJobContactInputDto", () => {
	describe("validation", () => {
		it("should pass with valid contact data and WHATSAPP method", async () => {
			const data: Partial<CreateJobContactInputDto> = {
				phoneNumber: "+5511999999999",
				method: JobContactMethod.WHATSAPP,
			};
			const dto = Object.assign(new CreateJobContactInputDto(), data);
			const errors = await validate(dto);

			expect(errors).toHaveLength(0);
		});

		it("should pass with valid contact data and PHONE_CALL method", async () => {
			const data: Partial<CreateJobContactInputDto> = {
				phoneNumber: "+5511999999999",
				method: JobContactMethod.PHONE_CALL,
			};
			const dto = Object.assign(new CreateJobContactInputDto(), data);
			const errors = await validate(dto);

			expect(errors).toHaveLength(0);
		});

		it("should fail with empty phone number", async () => {
			const data: Partial<CreateJobContactInputDto> = {
				phoneNumber: "",
				method: JobContactMethod.WHATSAPP,
			};
			const dto = Object.assign(new CreateJobContactInputDto(), data);
			const errors = await validate(dto);

			expect(errors).toHaveLength(1);
			expect(errors[0]?.property).toBe("phoneNumber");
		});

		it("should fail with invalid phone number", async () => {
			const data: Partial<CreateJobContactInputDto> = {
				phoneNumber: "123",
				method: JobContactMethod.WHATSAPP,
			};
			const dto = Object.assign(new CreateJobContactInputDto(), data);
			const errors = await validate(dto);

			expect(errors).toHaveLength(1);
			expect(errors[0]?.property).toBe("phoneNumber");
		});

		it("should fail with invalid contact method", async () => {
			const data: Partial<CreateJobContactInputDto> = {
				phoneNumber: "+5511999999999",
				method: "INVALID" as JobContactMethod,
			};
			const dto = Object.assign(new CreateJobContactInputDto(), data);
			const errors = await validate(dto);

			expect(errors).toHaveLength(1);
			expect(errors[0]?.property).toBe("method");
		});
	});
});
