import { validate } from "class-validator";
import { CreateJobContactInputDto } from "./create-job-contact-input.dto";

describe("CreateJobContactInputDto", () => {
	describe("validation", () => {
		it("should pass with valid contact data", async () => {
			const data: Partial<CreateJobContactInputDto> = { name: "João Silva", whatsappNumber: "+5511999999999" };
			const dto = Object.assign(new CreateJobContactInputDto(), data);
			const errors = await validate(dto);

			expect(errors).toHaveLength(0);
		});

		it("should fail with name shorter than 2 chars", async () => {
			const data: Partial<CreateJobContactInputDto> = { name: "A", whatsappNumber: "+5511999999999" };
			const dto = Object.assign(new CreateJobContactInputDto(), data);
			const errors = await validate(dto);

			expect(errors).toHaveLength(1);
			expect(errors[0]?.property).toBe("name");
		});

		it("should fail with name longer than 100 chars", async () => {
			const data: Partial<CreateJobContactInputDto> = { name: "A".repeat(101), whatsappNumber: "+5511999999999" };
			const dto = Object.assign(new CreateJobContactInputDto(), data);
			const errors = await validate(dto);

			expect(errors).toHaveLength(1);
			expect(errors[0]?.property).toBe("name");
		});

		it("should fail with empty whatsapp", async () => {
			const data: Partial<CreateJobContactInputDto> = { name: "João", whatsappNumber: "" };
			const dto = Object.assign(new CreateJobContactInputDto(), data);
			const errors = await validate(dto);

			expect(errors).toHaveLength(1);
			expect(errors[0]?.property).toBe("whatsappNumber");
		});

		it("should fail with invalid whatsapp number", async () => {
			const data: Partial<CreateJobContactInputDto> = { name: "João", whatsappNumber: "123" };
			const dto = Object.assign(new CreateJobContactInputDto(), data);
			const errors = await validate(dto);

			expect(errors).toHaveLength(1);
			expect(errors[0]?.property).toBe("whatsappNumber");
		});
	});
});
