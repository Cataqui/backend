import { validate } from "class-validator";
import { CreateJobRequestDto } from "./create-job-request.dto";
import { CreateJobContactInputDto } from "./create-job-contact-input.dto";
import { CreateJobLocationInputDto } from "./create-job-location-input.dto";
import { CreateJobPaymentInputDto } from "./create-job-payment-input.dto";
import { JobType, JobPaymentRecurrence } from "../../../../generated/prisma/client.js";

function createValidDto(): CreateJobRequestDto {
	const contact = new CreateJobContactInputDto({ name: "João Silva", whatsappNumber: "+5511999999999" });
	const location = new CreateJobLocationInputDto({ city: "São Paulo", state: "SP", country: "BR", street: "Rua das Flores, 123", neighborhood: "Centro" });
	const payment = new CreateJobPaymentInputDto({ amount: 150.0, recurrence: JobPaymentRecurrence.SINGLE, currency: "BRL" });

	return new CreateJobRequestDto({
		title: "Help unload truck",
		description: "Need someone to help unload a delivery truck.",
		contact,
		location,
		type: JobType.SINGLE,
		categoryId: "cm3x-cat-id",
		payment,
	});
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
			const contact = new CreateJobContactInputDto({ name: "João Silva", whatsappNumber: "+5511999999999" });
			const location = new CreateJobLocationInputDto({ city: "São Paulo", state: "SP", country: "BR" });
			const payment = new CreateJobPaymentInputDto({ amount: 150.0, recurrence: JobPaymentRecurrence.SINGLE, currency: "BRL" });
			const dto = new CreateJobRequestDto({
				title: "Help unload truck",
				description: "Need someone to help unload a delivery truck.",
				contact,
				location,
				type: JobType.SINGLE,
				categoryId: "cm3x-cat-id",
				payment,
				expiresAt: "2026-06-28T00:00:00Z",
			});

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

		it("should fail with invalid expires_at", async () => {
			const dto = createValidDto();
			(dto as { expiresAt: string }).expiresAt = "not-a-date";

			const errors = await validate(dto);

			expect(errors).toHaveLength(1);
			expect(errors[0]?.property).toBe("expiresAt");
		});

		it("should validate nested contact errors", async () => {
			const contact = new CreateJobContactInputDto({ name: "", whatsappNumber: "" });
			const location = new CreateJobLocationInputDto({ city: "São Paulo", state: "SP", country: "BR" });
			const payment = new CreateJobPaymentInputDto({ amount: 150.0, recurrence: JobPaymentRecurrence.SINGLE, currency: "BRL" });
			const dto = new CreateJobRequestDto({
				title: "Help unload truck",
				description: "Need someone to help unload a delivery truck.",
				contact,
				location,
				type: JobType.SINGLE,
				categoryId: "cm3x-cat-id",
				payment,
			});

			const errors = await validate(dto);

			expect(errors.length).toBeGreaterThan(0);
		});
	});
});
