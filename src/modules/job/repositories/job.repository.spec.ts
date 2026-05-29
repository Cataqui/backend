import { Test } from "@nestjs/testing";
import { JobRepository } from "./job.repository";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import type { Prisma } from "../../../../generated/prisma/client.js";

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/unbound-method */

interface MockJobWithCategory {
	id: string;
	title: string;
	description: string;
	contactName: string;
	contactWhatsapp: string;
	street: string | null;
	neighborhood: string | null;
	city: string;
	state: string;
	country: string;
	status: string;
	type: string;
	paymentAmount: { toNumber(): number };
	paymentRecurrence: string;
	paymentCurrency: string;
	expiresAt: Date;
	categoryId: string;
	createdAt: Date;
	updatedAt: Date;
	category: { id: string; name: string; slug: string };
}

const mockJob: MockJobWithCategory = {
	id: "cm3x-1234",
	title: "Help unload truck",
	description: "Need someone to help.",
	contactName: "João Silva",
	contactWhatsapp: "+5511999999999",
	street: "Rua das Flores, 123",
	neighborhood: "Centro",
	city: "São Paulo",
	state: "SP",
	country: "BR",
	status: "ACTIVE",
	type: "SINGLE",
	paymentAmount: { toNumber: (): number => 150.0 },
	paymentRecurrence: "SINGLE",
	paymentCurrency: "BRL",
	expiresAt: new Date("2026-06-28T00:00:00.000Z"),
	categoryId: "cm3x-cat-1",
	createdAt: new Date("2026-05-28T10:00:00.000Z"),
	updatedAt: new Date("2026-05-28T10:00:00.000Z"),
	category: { id: "cm3x-cat-1", name: "Moving Help", slug: "moving-help" },
};

const createParams: Prisma.JobUncheckedCreateInput = {
	title: "Help unload truck",
	description: "Need someone to help.",
	status: "ACTIVE",
	contactName: "João Silva",
	contactWhatsapp: "+5511999999999",
	street: "Rua das Flores, 123",
	neighborhood: "Centro",
	city: "São Paulo",
	state: "SP",
	country: "BR",
	type: "SINGLE",
	paymentAmount: 150.0,
	paymentRecurrence: "SINGLE",
	paymentCurrency: "BRL",
	expiresAt: new Date("2026-06-28T00:00:00.000Z"),
	categoryId: "cm3x-cat-1",
};

describe("JobRepository", () => {
	let repository: JobRepository;
	let prisma: PrismaService;

	beforeEach(async () => {
		prisma = {
			job: {
				create: vi.fn<(...args: unknown[]) => MockJobWithCategory>().mockReturnValue(mockJob),
			},
		} as unknown as PrismaService;

		const module = await Test.createTestingModule({
			providers: [JobRepository, { provide: PrismaService, useValue: prisma }],
		}).compile();

		repository = module.get(JobRepository);
	});

	describe("create", () => {
		it("should call prisma.job.create with flattened data and include category", async () => {
			await repository.create({ data: createParams });

			expect(prisma.job.create).toHaveBeenCalledWith({
				data: {
					title: "Help unload truck",
					description: "Need someone to help.",
					status: "ACTIVE",
					contactName: "João Silva",
					contactWhatsapp: "+5511999999999",
					street: "Rua das Flores, 123",
					neighborhood: "Centro",
					city: "São Paulo",
					state: "SP",
					country: "BR",
					type: "SINGLE",
					paymentAmount: 150.0,
					paymentRecurrence: "SINGLE",
					paymentCurrency: "BRL",
					expiresAt: new Date("2026-06-28T00:00:00.000Z"),
					categoryId: "cm3x-cat-1",
				},
				include: { category: true },
			});
		});

		it("should return the created job with category", async () => {
			const result = await repository.create({ data: createParams });

			expect(result).toEqual(mockJob);
			expect(result.category).toBeDefined();
			expect(result.category.name).toBe("Moving Help");
		});

		it("should convert nullish street to null", async () => {
			const params = { ...createParams, street: undefined as unknown as string | null, neighborhood: null as unknown as string | null };
			await repository.create({ data: params });

			const callData = (prisma.job.create as ReturnType<typeof vi.fn>).mock.calls[1]?.[0]?.data;

			if (callData) {
				expect(callData.street).toBeNull();
				expect(callData.neighborhood).toBeNull();
			}
		});
	});
});
