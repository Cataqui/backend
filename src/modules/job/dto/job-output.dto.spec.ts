import { instanceToPlain } from "class-transformer";
import { JobOutputDto } from "./job-output.dto";
import { JobStatus, JobType, JobPaymentType, JobContactMethod } from "../../../../generated/prisma/client.js";

function createMockDatabaseJob() {
	return {
		id: "cm3x-1234-abcd",
		title: "Help unload truck",
		description: "Need someone to help unload a delivery truck.",
		contactName: "João Silva",
		contactPhoneNumber: "+5511999999999",
		contactMethod: JobContactMethod.WHATSAPP,
		street: "Rua das Flores, 123",
		neighborhood: "Centro",
		city: "São Paulo",
		state: "SP",
		country: "BR",
		fuzzyLatitude: { toNumber: () => -23.55 },
		fuzzyLongitude: { toNumber: () => -46.63 },
		status: "ACTIVE" as const,
		type: "INDIVIDUAL" as const,
		paymentType: "FIXED" as const,
		paymentMinAmount: { toNumber: (): number => 150.0 },
		paymentMaxAmount: null,
		paymentNote: null,
		paymentAmountPeriod: "SINGLE" as const,
		paymentCurrency: "BRL",
		categoryId: "cm3x-cat-1",
		category: { id: "cm3x-cat-1", slug: "moving-help", createdAt: new Date(), updatedAt: new Date() },
		createdAt: new Date("2026-05-28T10:00:00.000Z"),
		updatedAt: new Date("2026-05-28T10:00:00.000Z"),
	};
}

describe("JobOutputDto", () => {
	describe("fromDatabase", () => {
		it("should assign all fields from a database job", () => {
			const job = createMockDatabaseJob();
			const dto = JobOutputDto.fromDatabase(job as Parameters<typeof JobOutputDto.fromDatabase>[0], "Moving Help");

			expect(dto.jobId).toBe("cm3x-1234-abcd");
			expect(dto.title).toBe("Help unload truck");
			expect(dto.description).toBe("Need someone to help unload a delivery truck.");
			expect(dto.status).toBe(JobStatus.ACTIVE);
			expect(dto.type).toBe(JobType.INDIVIDUAL);
		});

		it("should construct nested contact DTO", () => {
			const dto = JobOutputDto.fromDatabase(createMockDatabaseJob() as Parameters<typeof JobOutputDto.fromDatabase>[0], "Moving Help");

			expect(dto.contact.name).toBe("João Silva");
			expect(dto.contact.phoneNumber).toBe("+5511999999999");
			expect(dto.contact.method).toBe(JobContactMethod.WHATSAPP);
		});

		it("should construct nested location DTO", () => {
			const dto = JobOutputDto.fromDatabase(createMockDatabaseJob() as Parameters<typeof JobOutputDto.fromDatabase>[0], "Moving Help");

			expect(dto.location).toMatchObject({ neighborhood: "Centro", city: "São Paulo", state: "SP", country: "BR", latitude: -23.55, longitude: -46.63, areaRadius: 2000 });
		});

		it("should construct nested category DTO", () => {
			const dto = JobOutputDto.fromDatabase(createMockDatabaseJob() as Parameters<typeof JobOutputDto.fromDatabase>[0], "Moving Help");

			expect(dto.category.categoryId).toBe("cm3x-cat-1");
			expect(dto.category.name).toBe("Moving Help");
			expect(dto.category.slug).toBe("moving-help");
		});

		it("should use categoryDisplayName when provided", () => {
			const dto = JobOutputDto.fromDatabase(createMockDatabaseJob() as Parameters<typeof JobOutputDto.fromDatabase>[0], "Ayuda con mudanza");

			expect(dto.category.name).toBe("Ayuda con mudanza");
		});

		it("should use categoryDisplayName as category name", () => {
			const dto = JobOutputDto.fromDatabase(createMockDatabaseJob() as Parameters<typeof JobOutputDto.fromDatabase>[0], "Moving Help");

			expect(dto.category.name).toBe("Moving Help");
		});

		it("should construct nested payment DTO", () => {
			const dto = JobOutputDto.fromDatabase(createMockDatabaseJob() as Parameters<typeof JobOutputDto.fromDatabase>[0], "Moving Help");

			expect(dto.payment.type).toBe(JobPaymentType.FIXED);
			expect(dto.payment.minAmount).toBe(150.0);
			expect(dto.payment.maxAmount).toBeUndefined();
			expect(dto.payment.note).toBeUndefined();
			expect(dto.payment.amountPeriod).toBe("SINGLE");
			expect(dto.payment.currency).toBe("BRL");
		});

		it("should convert dates to ISO strings", () => {
			const dto = JobOutputDto.fromDatabase(createMockDatabaseJob() as Parameters<typeof JobOutputDto.fromDatabase>[0], "Moving Help");

			expect(dto.createdAt).toBe("2026-05-28T10:00:00.000Z");
			expect(dto.updatedAt).toBe("2026-05-28T10:00:00.000Z");
		});
	});

	describe("serialization", () => {
		it("should serialize job_id as snake_case", () => {
			const dto = JobOutputDto.fromDatabase(createMockDatabaseJob() as Parameters<typeof JobOutputDto.fromDatabase>[0], "Moving Help");
			const plain = instanceToPlain(dto, { exposeUnsetFields: false }) as Record<string, unknown>;

			expect(plain).toHaveProperty("job_id", "cm3x-1234-abcd");
			expect(plain).not.toHaveProperty("jobId");
		});

		it("should serialize nested contact with snake_case keys", () => {
			const dto = JobOutputDto.fromDatabase(createMockDatabaseJob() as Parameters<typeof JobOutputDto.fromDatabase>[0], "Moving Help");
			const plain = instanceToPlain(dto, { exposeUnsetFields: false }) as Record<string, unknown>;
			const contact = plain["contact"] as Record<string, unknown>;

			expect(contact).toHaveProperty("name", "João Silva");
			expect(contact).toHaveProperty("phone_number", "+5511999999999");
			expect(contact).toHaveProperty("contact_method", "WHATSAPP");
		});

		it("should serialize nested category with category_id", () => {
			const dto = JobOutputDto.fromDatabase(createMockDatabaseJob() as Parameters<typeof JobOutputDto.fromDatabase>[0], "Moving Help");
			const plain = instanceToPlain(dto, { exposeUnsetFields: false }) as Record<string, unknown>;
			const category = plain["category"] as Record<string, unknown>;

			expect(category).toHaveProperty("category_id", "cm3x-cat-1");
			expect(category).toHaveProperty("name", "Moving Help");
			expect(category).toHaveProperty("slug", "moving-help");
		});

		it("should serialize nested payment with expected keys", () => {
			const dto = JobOutputDto.fromDatabase(createMockDatabaseJob() as Parameters<typeof JobOutputDto.fromDatabase>[0], "Moving Help");
			const plain = instanceToPlain(dto, { exposeUnsetFields: false }) as Record<string, unknown>;
			const payment = plain["payment"] as Record<string, unknown>;

			expect(payment).toHaveProperty("type", "FIXED");
			expect(payment).toHaveProperty("min_amount", 150.0);
			expect(payment).toHaveProperty("amount_period", "SINGLE");
			expect(payment).toHaveProperty("currency", "BRL");
			expect(payment).not.toHaveProperty("max_amount");
			expect(payment).not.toHaveProperty("note");
		});

		it("should serialize dates as ISO strings", () => {
			const dto = JobOutputDto.fromDatabase(createMockDatabaseJob() as Parameters<typeof JobOutputDto.fromDatabase>[0], "Moving Help");
			const plain = instanceToPlain(dto, { exposeUnsetFields: false }) as Record<string, unknown>;

			expect(plain).toHaveProperty("created_at", "2026-05-28T10:00:00.000Z");
			expect(plain).toHaveProperty("updated_at", "2026-05-28T10:00:00.000Z");
		});

		it("should serialize nested location with fuzzy coordinates and area radius", () => {
			const dto = JobOutputDto.fromDatabase(createMockDatabaseJob() as Parameters<typeof JobOutputDto.fromDatabase>[0], "Moving Help");
			const plain = instanceToPlain(dto, { exposeUnsetFields: false }) as Record<string, unknown>;
			const location = plain["location"] as Record<string, unknown>;

			expect(location).toEqual({
				neighborhood: "Centro",
				city: "São Paulo",
				state: "SP",
				country: "BR",
				latitude: -23.55,
				longitude: -46.63,
				area_radius: 2000,
			});
		});

		it("should not serialize street in nested location", () => {
			const dto = JobOutputDto.fromDatabase(createMockDatabaseJob() as Parameters<typeof JobOutputDto.fromDatabase>[0], "Moving Help");
			const plain = instanceToPlain(dto, { exposeUnsetFields: false }) as Record<string, unknown>;
			const location = plain["location"] as Record<string, unknown>;

			expect(location).not.toHaveProperty("street");
		});
	});
});
