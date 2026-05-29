import { instanceToPlain } from "class-transformer";
import { JobOutputDto } from "./job-output.dto";
import { JobStatus, JobType } from "../../../../generated/prisma/client.js";

function createMockDatabaseJob() {
	return {
		id: "cm3x-1234-abcd",
		title: "Help unload truck",
		description: "Need someone to help unload a delivery truck.",
		contactName: "João Silva",
		contactWhatsapp: "+5511999999999",
		street: "Rua das Flores, 123",
		neighborhood: "Centro",
		city: "São Paulo",
		state: "SP",
		country: "BR",
		status: "ACTIVE" as const,
		type: "SINGLE" as const,
		paymentAmount: { toNumber: (): number => 150.0 },
		paymentRecurrence: "SINGLE" as const,
		paymentCurrency: "BRL",
		expiresAt: new Date("2026-06-28T00:00:00.000Z"),
		categoryId: "cm3x-cat-1",
		category: { id: "cm3x-cat-1", name: "Moving Help", slug: "moving-help", createdAt: new Date(), updatedAt: new Date() },
		createdAt: new Date("2026-05-28T10:00:00.000Z"),
		updatedAt: new Date("2026-05-28T10:00:00.000Z"),
	};
}

describe("JobOutputDto", () => {
	describe("fromDatabase", () => {
		it("should assign all fields from a database job", () => {
			const job = createMockDatabaseJob();
			const dto = JobOutputDto.fromDatabase(job as Parameters<typeof JobOutputDto.fromDatabase>[0]);

			expect(dto.jobId).toBe("cm3x-1234-abcd");
			expect(dto.title).toBe("Help unload truck");
			expect(dto.description).toBe("Need someone to help unload a delivery truck.");
			expect(dto.status).toBe(JobStatus.ACTIVE);
			expect(dto.type).toBe(JobType.SINGLE);
		});

		it("should construct nested contact DTO", () => {
			const dto = JobOutputDto.fromDatabase(createMockDatabaseJob() as Parameters<typeof JobOutputDto.fromDatabase>[0]);

			expect(dto.contact.name).toBe("João Silva");
			expect(dto.contact.whatsappNumber).toBe("+5511999999999");
			expect(dto.contact.whatsappUrl).toBe("https://wa.me/5511999999999");
		});

		it("should construct nested location DTO", () => {
			const dto = JobOutputDto.fromDatabase(createMockDatabaseJob() as Parameters<typeof JobOutputDto.fromDatabase>[0]);

			expect(dto.location.city).toBe("São Paulo");
			expect(dto.location.state).toBe("SP");
			expect(dto.location.country).toBe("BR");
		});

		it("should construct nested category DTO", () => {
			const dto = JobOutputDto.fromDatabase(createMockDatabaseJob() as Parameters<typeof JobOutputDto.fromDatabase>[0]);

			expect(dto.category.categoryId).toBe("cm3x-cat-1");
			expect(dto.category.name).toBe("Moving Help");
			expect(dto.category.slug).toBe("moving-help");
		});

		it("should construct nested payment DTO", () => {
			const dto = JobOutputDto.fromDatabase(createMockDatabaseJob() as Parameters<typeof JobOutputDto.fromDatabase>[0]);

			expect(dto.payment.amount).toBe(150.0);
			expect(dto.payment.recurrence).toBe("SINGLE");
			expect(dto.payment.currency).toBe("BRL");
		});

		it("should convert dates to ISO strings", () => {
			const dto = JobOutputDto.fromDatabase(createMockDatabaseJob() as Parameters<typeof JobOutputDto.fromDatabase>[0]);

			expect(dto.expiresAt).toBe("2026-06-28T00:00:00.000Z");
			expect(dto.createdAt).toBe("2026-05-28T10:00:00.000Z");
			expect(dto.updatedAt).toBe("2026-05-28T10:00:00.000Z");
		});
	});

	describe("serialization", () => {
		it("should serialize job_id as snake_case", () => {
			const dto = JobOutputDto.fromDatabase(createMockDatabaseJob() as Parameters<typeof JobOutputDto.fromDatabase>[0]);
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).toHaveProperty("job_id", "cm3x-1234-abcd");
			expect(plain).not.toHaveProperty("jobId");
		});

		it("should serialize nested contact with snake_case keys", () => {
			const dto = JobOutputDto.fromDatabase(createMockDatabaseJob() as Parameters<typeof JobOutputDto.fromDatabase>[0]);
			const plain = instanceToPlain(dto) as Record<string, unknown>;
			const contact = plain["contact"] as Record<string, unknown>;

			expect(contact).toHaveProperty("name", "João Silva");
			expect(contact).toHaveProperty("whatsapp_number", "+5511999999999");
			expect(contact).toHaveProperty("whatsapp_url", "https://wa.me/5511999999999");
		});

		it("should serialize nested category with category_id", () => {
			const dto = JobOutputDto.fromDatabase(createMockDatabaseJob() as Parameters<typeof JobOutputDto.fromDatabase>[0]);
			const plain = instanceToPlain(dto) as Record<string, unknown>;
			const category = plain["category"] as Record<string, unknown>;

			expect(category).toHaveProperty("category_id", "cm3x-cat-1");
			expect(category).toHaveProperty("name", "Moving Help");
			expect(category).toHaveProperty("slug", "moving-help");
		});

		it("should serialize nested payment with expected keys", () => {
			const dto = JobOutputDto.fromDatabase(createMockDatabaseJob() as Parameters<typeof JobOutputDto.fromDatabase>[0]);
			const plain = instanceToPlain(dto) as Record<string, unknown>;
			const payment = plain["payment"] as Record<string, unknown>;

			expect(payment).toHaveProperty("amount", 150.0);
			expect(payment).toHaveProperty("recurrence", "SINGLE");
			expect(payment).toHaveProperty("currency", "BRL");
		});

		it("should serialize dates as ISO strings", () => {
			const dto = JobOutputDto.fromDatabase(createMockDatabaseJob() as Parameters<typeof JobOutputDto.fromDatabase>[0]);
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).toHaveProperty("expires_at", "2026-06-28T00:00:00.000Z");
			expect(plain).toHaveProperty("created_at", "2026-05-28T10:00:00.000Z");
			expect(plain).toHaveProperty("updated_at", "2026-05-28T10:00:00.000Z");
		});
	});
});
