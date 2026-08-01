import { instanceToPlain } from "class-transformer";
import {
	JobContactMethod,
	JobPaymentAmountPeriod,
	JobPaymentType,
	JobStatus,
	JobType,
	Prisma,
} from "../../../../generated/prisma/client.js";
import { RequiredToPublishMetadata } from "../decorators/required-to-publish.decorator";
import { JobOutputDto } from "./job-output.dto";

function createMockDatabaseJob() {
	return {
		id: "cm3x-1234-abcd",
		title: "Help unload truck",
		description: "Need someone to help unload a delivery truck.",
		descriptionSummary: "Paid moving help available today.",
		contact: {
			id: "cm3x-contact-1",
			contactMethod: JobContactMethod.WHATSAPP,
			identifier: "+5511999999999",
		},
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
		createdAt: new Date("2026-05-28T10:00:00.000Z"),
		updatedAt: new Date("2026-05-28T10:00:00.000Z"),
	};
}

describe("JobOutputDto", () => {
	describe("fromDatabase", () => {
		it("should represent an incomplete draft with nullable publication fields", () => {
			const dto = JobOutputDto.fromDatabase({
				...createMockDatabaseJob(),
				id: "afdfd9b2-203d-4528-8a1c-82b6b139039b",
				title: null,
				description: "Descrição original sem detalhes suficientes.",
				descriptionSummary: null,
				contact: null,
				neighborhood: null,
				city: null,
				state: null,
				country: null,
				fuzzyLatitude: null,
				fuzzyLongitude: null,
				status: JobStatus.DRAFT,
				type: null,
				paymentType: null,
				paymentMinAmount: null,
				paymentMaxAmount: null,
				paymentNote: null,
				paymentAmountPeriod: null,
				paymentCurrency: null,
				createdAt: new Date("2026-07-30T12:00:00.000Z"),
				updatedAt: new Date("2026-07-30T12:01:00.000Z"),
			});

			expect(instanceToPlain(dto)).toMatchObject({
				title: null,
				description_summary: null,
				contact_reference: null,
				location: null,
				payment: null,
			});
		});

		it("should identify every missing field required to publish an incomplete draft", () => {
			const dto = JobOutputDto.fromDatabase({
				...createMockDatabaseJob(),
				title: null,
				descriptionSummary: null,
				contact: null,
				neighborhood: null,
				city: null,
				state: null,
				country: null,
				fuzzyLatitude: null,
				fuzzyLongitude: null,
				type: null,
				paymentType: null,
				paymentMinAmount: null,
				paymentMaxAmount: null,
				paymentNote: null,
				paymentAmountPeriod: null,
				paymentCurrency: null,
			} as Parameters<typeof JobOutputDto.fromDatabase>[0]);

			const missingFields = RequiredToPublishMetadata.getFields({ dtoClass: JobOutputDto })
				.filter(({ propertyName }) => dto[propertyName] === null)
				.map(({ publicFieldName }) => publicFieldName);

			expect(missingFields).toEqual(["contact", "location", "payment", "type"]);
		});

		it("should preserve populated draft metadata", () => {
			const dto = JobOutputDto.fromDatabase({
				...createMockDatabaseJob(),
				id: "afdfd9b2-203d-4528-8a1c-82b6b139039b",
				title: "Auxiliar de cozinha",
				description: "Descrição original.",
				descriptionSummary: "Preparar alimentos e organizar a cozinha",
				contact: null,
				neighborhood: null,
				city: null,
				state: null,
				country: null,
				fuzzyLatitude: null,
				fuzzyLongitude: null,
				status: JobStatus.DRAFT,
				type: JobType.EMPLOYMENT,
				paymentType: JobPaymentType.FIXED,
				paymentMinAmount: new Prisma.Decimal(2100),
				paymentMaxAmount: null,
				paymentNote: null,
				paymentAmountPeriod: JobPaymentAmountPeriod.MONTHLY,
				paymentCurrency: "BRL",
				createdAt: new Date("2026-07-30T12:00:00.000Z"),
				updatedAt: new Date("2026-07-30T12:01:00.000Z"),
			});

			expect(dto).toMatchObject({
				title: "Auxiliar de cozinha",
				descriptionSummary: "Preparar alimentos e organizar a cozinha",
				type: JobType.EMPLOYMENT,
				status: JobStatus.DRAFT,
			});
		});

		it("should preserve nullable fields without enforcing lifecycle rules", () => {
			const job = { ...createMockDatabaseJob(), descriptionSummary: null };
			const dto = JobOutputDto.fromDatabase(job as Parameters<typeof JobOutputDto.fromDatabase>[0]);

			expect(dto.descriptionSummary).toBeNull();
		});

		it("should assign all fields from a database job", () => {
			const job = createMockDatabaseJob();
			const dto = JobOutputDto.fromDatabase(job as Parameters<typeof JobOutputDto.fromDatabase>[0]);

			expect(dto.jobId).toBe("cm3x-1234-abcd");
			expect(dto.title).toBe("Help unload truck");
			expect(dto.description).toBe("Need someone to help unload a delivery truck.");
			expect(dto.status).toBe(JobStatus.ACTIVE);
			expect(dto.type).toBe(JobType.INDIVIDUAL);
		});

		it("should construct nested contact reference DTO", () => {
			const dto = JobOutputDto.fromDatabase(createMockDatabaseJob() as Parameters<typeof JobOutputDto.fromDatabase>[0]);

			expect(dto.contactReference?.contactId).toBe("cm3x-contact-1");
			expect(dto.contactReference?.contactMethod).toBe(JobContactMethod.WHATSAPP);
		});

		it("should construct nested location DTO", () => {
			const dto = JobOutputDto.fromDatabase(createMockDatabaseJob() as Parameters<typeof JobOutputDto.fromDatabase>[0]);

			expect(dto.location).toMatchObject({
				neighborhood: "Centro",
				city: "São Paulo",
				state: "SP",
				country: "BR",
				latitude: -23.55,
				longitude: -46.63,
				areaRadius: 2000,
			});
		});

		it.each([
			"neighborhood",
			"city",
			"state",
			"country",
			"fuzzyLatitude",
			"fuzzyLongitude",
		] as const)("should return a null location when %s is unavailable", (field) => {
			const dto = JobOutputDto.fromDatabase({
				...createMockDatabaseJob(),
				[field]: null,
			} as Parameters<typeof JobOutputDto.fromDatabase>[0]);

			expect(dto.location).toBeNull();
		});

		it("should construct payment details after payment has been supplied", () => {
			const dto = JobOutputDto.fromDatabase(createMockDatabaseJob() as Parameters<typeof JobOutputDto.fromDatabase>[0]);

			expect(dto.payment).toMatchObject({
				type: JobPaymentType.FIXED,
				minAmount: 150,
				maxAmount: null,
				note: null,
				amountPeriod: JobPaymentAmountPeriod.SINGLE,
				currency: "BRL",
			});
		});

		it.each([
			"paymentType",
			"paymentAmountPeriod",
			"paymentCurrency",
		] as const)("should return a null payment when the required field %s is unavailable", (field) => {
			const dto = JobOutputDto.fromDatabase({
				...createMockDatabaseJob(),
				[field]: null,
			} as Parameters<typeof JobOutputDto.fromDatabase>[0]);

			expect(dto.payment).toBeNull();
		});

		it("should convert dates to ISO strings", () => {
			const dto = JobOutputDto.fromDatabase(createMockDatabaseJob() as Parameters<typeof JobOutputDto.fromDatabase>[0]);

			expect(dto.createdAt).toBe("2026-05-28T10:00:00.000Z");
			expect(dto.updatedAt).toBe("2026-05-28T10:00:00.000Z");
		});
	});

	describe("serialization", () => {
		it("should not serialize a category field", () => {
			const dto = JobOutputDto.fromDatabase(createMockDatabaseJob() as Parameters<typeof JobOutputDto.fromDatabase>[0]);
			const plain = instanceToPlain(dto, { exposeUnsetFields: false }) as Record<string, unknown>;

			expect(plain).not.toHaveProperty("category");
		});

		it("should serialize description_summary as snake_case", () => {
			const dto = JobOutputDto.fromDatabase(createMockDatabaseJob() as Parameters<typeof JobOutputDto.fromDatabase>[0]);
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).toHaveProperty("description_summary", "Paid moving help available today.");
		});

		it("should serialize job_id as snake_case", () => {
			const dto = JobOutputDto.fromDatabase(createMockDatabaseJob() as Parameters<typeof JobOutputDto.fromDatabase>[0]);
			const plain = instanceToPlain(dto, { exposeUnsetFields: false }) as Record<string, unknown>;

			expect(plain).toHaveProperty("job_id", "cm3x-1234-abcd");
			expect(plain).not.toHaveProperty("jobId");
		});

		it("should serialize nested contact reference with snake_case keys", () => {
			const dto = JobOutputDto.fromDatabase(createMockDatabaseJob() as Parameters<typeof JobOutputDto.fromDatabase>[0]);
			const plain = instanceToPlain(dto, { exposeUnsetFields: false }) as Record<string, unknown>;
			const contact = plain["contact_reference"] as Record<string, unknown>;

			expect(contact).toHaveProperty("contact_id", "cm3x-contact-1");
			expect(contact).toHaveProperty("contact_method", "WHATSAPP");
			expect(contact).not.toHaveProperty("contact_details");
		});

		it("should serialize nested payment with expected keys", () => {
			const dto = JobOutputDto.fromDatabase(createMockDatabaseJob() as Parameters<typeof JobOutputDto.fromDatabase>[0]);
			const plain = instanceToPlain(dto, { exposeUnsetFields: false }) as Record<string, unknown>;
			const payment = plain["payment"] as Record<string, unknown>;

			expect(payment).toHaveProperty("type", "FIXED");
			expect(payment).toHaveProperty("min_amount", 150.0);
			expect(payment).toHaveProperty("amount_period", "SINGLE");
			expect(payment).toHaveProperty("currency", "BRL");
			expect(payment).toHaveProperty("max_amount", null);
			expect(payment).toHaveProperty("note", null);
		});

		it("should serialize dates as ISO strings", () => {
			const dto = JobOutputDto.fromDatabase(createMockDatabaseJob() as Parameters<typeof JobOutputDto.fromDatabase>[0]);
			const plain = instanceToPlain(dto, { exposeUnsetFields: false }) as Record<string, unknown>;

			expect(plain).toHaveProperty("created_at", "2026-05-28T10:00:00.000Z");
			expect(plain).toHaveProperty("updated_at", "2026-05-28T10:00:00.000Z");
		});

		it("should serialize nested location with fuzzy coordinates and area radius", () => {
			const dto = JobOutputDto.fromDatabase(createMockDatabaseJob() as Parameters<typeof JobOutputDto.fromDatabase>[0]);
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
			const dto = JobOutputDto.fromDatabase(createMockDatabaseJob() as Parameters<typeof JobOutputDto.fromDatabase>[0]);
			const plain = instanceToPlain(dto, { exposeUnsetFields: false }) as Record<string, unknown>;
			const location = plain["location"] as Record<string, unknown>;

			expect(location).not.toHaveProperty("street");
		});
	});
});
