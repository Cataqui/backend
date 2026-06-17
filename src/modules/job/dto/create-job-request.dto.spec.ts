import { validate } from "class-validator";
import {
	JobContactMethod,
	JobPaymentAmountPeriod,
	JobPaymentType,
	JobType,
} from "../../../../generated/prisma/client.js";
import { CreateJobContactInputDto } from "./create-job-contact-input.dto";
import { CreateJobLocationInputDto } from "./create-job-location-input.dto";
import { CreateJobRequestDto } from "./create-job-request.dto";
import { JobPaymentInputDto } from "./job-payment-input.dto";

function createValidDto(): CreateJobRequestDto {
	const contactData: Partial<CreateJobContactInputDto> = {
		name: "João Silva",
		phoneNumber: "+5511999999999",
		method: JobContactMethod.WHATSAPP,
	};
	const contact = Object.assign(new CreateJobContactInputDto(), contactData);
	const locationData: Partial<CreateJobLocationInputDto> = {
		city: "São Paulo",
		state: "SP",
		country: "BR",
		street: "Rua das Flores, 123",
		neighborhood: "Centro",
		latitude: -23.55052,
		longitude: -46.633308,
	};
	const location = Object.assign(new CreateJobLocationInputDto(), locationData);
	const paymentData: Partial<JobPaymentInputDto> = {
		type: JobPaymentType.FIXED,
		minAmount: 150.0,
		amountPeriod: JobPaymentAmountPeriod.SINGLE,
		currency: "BRL",
	};
	const payment = Object.assign(new JobPaymentInputDto(), paymentData);

	const dtoData: Partial<CreateJobRequestDto> = {
		title: "Help unload truck",
		description: "Need someone to help unload a delivery truck.",
		contact,
		location,
		type: JobType.INDIVIDUAL,
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

		it("should validate nested contact errors", async () => {
			const contactData: Partial<CreateJobContactInputDto> = {
				name: "",
				phoneNumber: "",
				method: undefined as unknown as JobContactMethod,
			};
			const contact = Object.assign(new CreateJobContactInputDto(), contactData);
			const locationData: Partial<CreateJobLocationInputDto> = {
				city: "São Paulo",
				state: "SP",
				country: "BR",
				neighborhood: "Centro",
				latitude: -23.55052,
				longitude: -46.633308,
			};
			const location = Object.assign(new CreateJobLocationInputDto(), locationData);
			const paymentData: Partial<JobPaymentInputDto> = {
				type: JobPaymentType.FIXED,
				minAmount: 150.0,
				amountPeriod: JobPaymentAmountPeriod.SINGLE,
				currency: "BRL",
			};
			const payment = Object.assign(new JobPaymentInputDto(), paymentData);
			const dtoData: Partial<CreateJobRequestDto> = {
				title: "Help unload truck",
				description: "Need someone to help unload a delivery truck.",
				contact,
				location,
				type: JobType.INDIVIDUAL,
				categoryId: "550e8400-e29b-41d4-a716-446655440000",
				payment,
			};
			const dto = Object.assign(new CreateJobRequestDto(), dtoData);

			const errors = await validate(dto);

			expect(errors.length).toBeGreaterThan(0);
		});
	});

	describe("payment cross-field validation", () => {
		const baseDto = {
			title: "Help unload truck",
			description: "Need someone to help unload a delivery truck.",
			type: JobType.INDIVIDUAL,
			categoryId: "550e8400-e29b-41d4-a716-446655440000",
		};

		function buildDto(paymentData: Partial<JobPaymentInputDto>): CreateJobRequestDto {
			const contact = Object.assign(new CreateJobContactInputDto(), {
				name: "João Silva",
				phoneNumber: "+5511999999999",
				method: JobContactMethod.WHATSAPP,
			});
			const location = Object.assign(new CreateJobLocationInputDto(), {
				city: "São Paulo",
				state: "SP",
				country: "BR",
				street: "Rua das Flores, 123",
				neighborhood: "Centro",
				latitude: -23.55052,
				longitude: -46.633308,
			});
			const payment = Object.assign(new JobPaymentInputDto(), paymentData);
			return Object.assign(new CreateJobRequestDto(), { ...baseDto, contact, location, payment });
		}

		it("should pass with valid FIXED payment", async () => {
			const dto = buildDto({
				type: JobPaymentType.FIXED,
				minAmount: 150.0,
				amountPeriod: JobPaymentAmountPeriod.SINGLE,
				currency: "BRL",
			});
			const errors = await validate(dto);

			expect(errors).toHaveLength(0);
		});

		it("should pass with valid RANGE payment", async () => {
			const dto = buildDto({
				type: JobPaymentType.RANGE,
				minAmount: 100.0,
				maxAmount: 200.0,
				amountPeriod: JobPaymentAmountPeriod.SINGLE,
				currency: "BRL",
			});
			const errors = await validate(dto);

			expect(errors).toHaveLength(0);
		});

		it("should pass with valid FLEXIBLE payment", async () => {
			const dto = buildDto({
				type: JobPaymentType.FLEXIBLE,
				amountPeriod: JobPaymentAmountPeriod.SINGLE,
				currency: "BRL",
			});
			const errors = await validate(dto);

			expect(errors).toHaveLength(0);
		});

		it("should pass with valid OTHER payment", async () => {
			const dto = buildDto({
				type: JobPaymentType.OTHER,
				note: "Commission-based",
				amountPeriod: JobPaymentAmountPeriod.SINGLE,
				currency: "BRL",
			});
			const errors = await validate(dto);

			expect(errors).toHaveLength(0);
		});

		it("should fail when FIXED has no minAmount", async () => {
			const dto = buildDto({
				type: JobPaymentType.FIXED,
				amountPeriod: JobPaymentAmountPeriod.SINGLE,
				currency: "BRL",
			});
			const errors = await validate(dto);

			expect(errors.length).toBeGreaterThan(0);
		});

		it("should fail when FIXED has maxAmount", async () => {
			const dto = buildDto({
				type: JobPaymentType.FIXED,
				minAmount: 100.0,
				maxAmount: 200.0,
				amountPeriod: JobPaymentAmountPeriod.SINGLE,
				currency: "BRL",
			});
			const errors = await validate(dto);

			expect(errors.length).toBeGreaterThan(0);
		});

		it("should fail when RANGE has no minAmount", async () => {
			const dto = buildDto({
				type: JobPaymentType.RANGE,
				maxAmount: 200.0,
				amountPeriod: JobPaymentAmountPeriod.SINGLE,
				currency: "BRL",
			});
			const errors = await validate(dto);

			expect(errors.length).toBeGreaterThan(0);
		});

		it("should fail when RANGE has no maxAmount", async () => {
			const dto = buildDto({
				type: JobPaymentType.RANGE,
				minAmount: 100.0,
				amountPeriod: JobPaymentAmountPeriod.SINGLE,
				currency: "BRL",
			});
			const errors = await validate(dto);

			expect(errors.length).toBeGreaterThan(0);
		});

		it("should fail when maxAmount <= minAmount", async () => {
			const dto = buildDto({
				type: JobPaymentType.RANGE,
				minAmount: 200.0,
				maxAmount: 100.0,
				amountPeriod: JobPaymentAmountPeriod.SINGLE,
				currency: "BRL",
			});
			const errors = await validate(dto);

			expect(errors.length).toBeGreaterThan(0);
		});

		it("should fail when FLEXIBLE has minAmount", async () => {
			const dto = buildDto({
				type: JobPaymentType.FLEXIBLE,
				minAmount: 100.0,
				amountPeriod: JobPaymentAmountPeriod.SINGLE,
				currency: "BRL",
			});
			const errors = await validate(dto);

			expect(errors.length).toBeGreaterThan(0);
		});

		it("should fail when OTHER has no note", async () => {
			const dto = buildDto({
				type: JobPaymentType.OTHER,
				amountPeriod: JobPaymentAmountPeriod.SINGLE,
				currency: "BRL",
			});
			const errors = await validate(dto);

			expect(errors.length).toBeGreaterThan(0);
		});

		it("should fail when OTHER has amounts", async () => {
			const dto = buildDto({
				type: JobPaymentType.OTHER,
				minAmount: 100.0,
				note: "Commission",
				amountPeriod: JobPaymentAmountPeriod.SINGLE,
				currency: "BRL",
			});
			const errors = await validate(dto);

			expect(errors.length).toBeGreaterThan(0);
		});
	});
});
