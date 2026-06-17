import { validate } from "class-validator";
import { JobContactMethod } from "../../../../generated/prisma/client.js";
import { CreateJobContactInputDto } from "./create-job-contact-input.dto";

describe("CreateJobContactInputDto", () => {
	describe("validation", () => {
		it("should pass with valid contact data and WHATSAPP method", async () => {
			const data: Partial<CreateJobContactInputDto> = {
				name: "João Silva",
				phoneNumber: "+5511999999999",
				method: JobContactMethod.WHATSAPP,
			};
			const dto = Object.assign(new CreateJobContactInputDto(), data);
			const errors = await validate(dto);

			expect(errors).toHaveLength(0);
		});

		it("should pass with valid contact data and PHONE_CALL method", async () => {
			const data: Partial<CreateJobContactInputDto> = {
				name: "João Silva",
				phoneNumber: "+5511999999999",
				method: JobContactMethod.PHONE_CALL,
			};
			const dto = Object.assign(new CreateJobContactInputDto(), data);
			const errors = await validate(dto);

			expect(errors).toHaveLength(0);
		});

		it("should fail with name shorter than 2 chars", async () => {
			const data: Partial<CreateJobContactInputDto> = {
				name: "A",
				phoneNumber: "+5511999999999",
				method: JobContactMethod.WHATSAPP,
			};
			const dto = Object.assign(new CreateJobContactInputDto(), data);
			const errors = await validate(dto);

			expect(errors).toHaveLength(1);
			expect(errors[0]?.property).toBe("name");
		});

		it("should fail with name longer than 100 chars", async () => {
			const data: Partial<CreateJobContactInputDto> = {
				name: "A".repeat(101),
				phoneNumber: "+5511999999999",
				method: JobContactMethod.WHATSAPP,
			};
			const dto = Object.assign(new CreateJobContactInputDto(), data);
			const errors = await validate(dto);

			expect(errors).toHaveLength(1);
			expect(errors[0]?.property).toBe("name");
		});

		it("should fail with empty phone number", async () => {
			const data: Partial<CreateJobContactInputDto> = {
				name: "João",
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
				name: "João",
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
				name: "João",
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
