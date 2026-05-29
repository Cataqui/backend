import { validate } from "class-validator";
import { CreateJobRequestDto } from "./create-job-request.dto";
import { CreateJobContactInputDto } from "./create-job-contact-input.dto";
import { CreateJobLocationInputDto } from "./create-job-location-input.dto";
import { CreateJobPaymentInputDto } from "./create-job-payment-input.dto";
import { JobType, JobPaymentRecurrence } from "../../../../generated/prisma/client.js";

function createValidDto(): CreateJobRequestDto {
	const contactData: Partial<CreateJobContactInputDto> = { name: "João Silva", whatsappNumber: "+5511999999999" };
	const contact = Object.assign(new CreateJobContactInputDto(), contactData);
	const locationData: Partial<CreateJobLocationInputDto> = { city: "São Paulo", state: "SP", country: "BR", street: "Rua das Flores, 123", neighborhood: "Centro" };
	const location = Object.assign(new CreateJobLocationInputDto(), locationData);
	const paymentData: Partial<CreateJobPaymentInputDto> = { amount: 150.0, recurrence: JobPaymentRecurrence.SINGLE, currency: "BRL" };
	const payment = Object.assign(new CreateJobPaymentInputDto(), paymentData);

	const dtoData: Partial<CreateJobRequestDto> = {
		title: "Help unload truck",
		description: "Need someone to help unload a delivery truck.",
		contact,
		location,
		type: JobType.SINGLE,
		categoryId: "550e8400-e29b-41d4-a716-446655440000",
		payment,
	};
	return Object.assign(new CreateJobRequestDto(), dtoData);
}

describe("CreateJobRequestDto", () => {
	describe("validation", () => {
		it("should pass with valid data", async () => {
			const dto = createValidDto();
			const errors = await validate(dto);

			expect(errors).toHaveLength(0);
		});

		it("should fail with title shorter than 3 chars", async () => {
			const dto = createValidDto();
			(dto as { title: string }).title = "AB";

			const errors = await validate(dto);

			expect(errors).toHaveLength(1);
			expect(errors[0]?.property).toBe("title");
		});

		it("should fail with title longer than 120 chars", async () => {
			const dto = createValidDto();
			(dto as { title: string }).title = "A".repeat(121);

			const errors = await validate(dto);

			expect(errors).toHaveLength(1);
			expect(errors[0]?.property).toBe("title");
		});

		it("should fail with description shorter than 10 chars", async () => {
			const dto = createValidDto();
			(dto as { description: string }).description = "Short";

			const errors = await validate(dto);

			expect(errors).toHaveLength(1);
			expect(errors[0]?.property).toBe("description");
		});

		it("should pass with optional expires_at omitted", async () => {
			const dto = createValidDto();
			const errors = await validate(dto);

			expect(errors).toHaveLength(0);
		});

		it("should pass with valid expires_at", async () => {
			const contactData: Partial<CreateJobContactInputDto> = { name: "João Silva", whatsappNumber: "+5511999999999" };
			const contact = Object.assign(new CreateJobContactInputDto(), contactData);
			const locationData: Partial<CreateJobLocationInputDto> = { city: "São Paulo", state: "SP", country: "BR" };
			const location = Object.assign(new CreateJobLocationInputDto(), locationData);
			const paymentData: Partial<CreateJobPaymentInputDto> = { amount: 150.0, recurrence: JobPaymentRecurrence.SINGLE, currency: "BRL" };
			const payment = Object.assign(new CreateJobPaymentInputDto(), paymentData);
			const dtoData: Partial<CreateJobRequestDto> = {
				title: "Help unload truck",
				description: "Need someone to help unload a delivery truck.",
				contact,
				location,
				type: JobType.SINGLE,
				categoryId: "550e8400-e29b-41d4-a716-446655440000",
				payment,
				expiresAt: "2026-06-28T00:00:00Z",
			};
			const dto = Object.assign(new CreateJobRequestDto(), dtoData);

			const errors = await validate(dto);

			expect(errors).toHaveLength(0);
		});

		it("should fail with invalid type", async () => {
			const dto = createValidDto();
			(dto as { type: string }).type = "INVALID_TYPE";

			const errors = await validate(dto);

			expect(errors).toHaveLength(1);
			expect(errors[0]?.property).toBe("type");
		});

		it("should fail with non-UUID categoryId", async () => {
			const dto = createValidDto();
			(dto as { categoryId: string }).categoryId = "not-a-uuid";

			const errors = await validate(dto);

			expect(errors).toHaveLength(1);
			expect(errors[0]?.property).toBe("categoryId");
		});

		it("should fail with invalid expires_at", async () => {
			const contactData: Partial<CreateJobContactInputDto> = { name: "João Silva", whatsappNumber: "+5511999999999" };
			const contact = Object.assign(new CreateJobContactInputDto(), contactData);
			const locationData: Partial<CreateJobLocationInputDto> = { city: "São Paulo", state: "SP", country: "BR" };
			const location = Object.assign(new CreateJobLocationInputDto(), locationData);
			const paymentData: Partial<CreateJobPaymentInputDto> = { amount: 150.0, recurrence: JobPaymentRecurrence.SINGLE, currency: "BRL" };
			const payment = Object.assign(new CreateJobPaymentInputDto(), paymentData);
			const dtoData: Partial<CreateJobRequestDto> = {
				title: "Help unload truck",
				description: "Need someone to help unload a delivery truck.",
				contact,
				location,
				type: JobType.SINGLE,
				categoryId: "550e8400-e29b-41d4-a716-446655440000",
				payment,
				expiresAt: "not-a-date",
			};
			const dto = Object.assign(new CreateJobRequestDto(), dtoData);

			const errors = await validate(dto);

			expect(errors).toHaveLength(1);
			expect(errors[0]?.property).toBe("expiresAt");
		});

		it("should validate nested contact errors", async () => {
			const contactData: Partial<CreateJobContactInputDto> = { name: "", whatsappNumber: "" };
			const contact = Object.assign(new CreateJobContactInputDto(), contactData);
			const locationData: Partial<CreateJobLocationInputDto> = { city: "São Paulo", state: "SP", country: "BR" };
			const location = Object.assign(new CreateJobLocationInputDto(), locationData);
			const paymentData: Partial<CreateJobPaymentInputDto> = { amount: 150.0, recurrence: JobPaymentRecurrence.SINGLE, currency: "BRL" };
			const payment = Object.assign(new CreateJobPaymentInputDto(), paymentData);
			const dtoData: Partial<CreateJobRequestDto> = {
				title: "Help unload truck",
				description: "Need someone to help unload a delivery truck.",
				contact,
				location,
				type: JobType.SINGLE,
				categoryId: "550e8400-e29b-41d4-a716-446655440000",
				payment,
			};
			const dto = Object.assign(new CreateJobRequestDto(), dtoData);

			const errors = await validate(dto);

			expect(errors.length).toBeGreaterThan(0);
		});
	});
});
