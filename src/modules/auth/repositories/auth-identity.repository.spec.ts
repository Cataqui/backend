import { Test } from "@nestjs/testing";
import { AuthIdentityProvider, JobContactMethod, Prisma } from "../../../../generated/prisma/client.js";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { AuthIdentityRepository } from "./auth-identity.repository";

describe("AuthIdentityRepository", () => {
	it("should save the verified identity and reusable contact with one parameterized database-function call", async () => {
		const queryRaw = vi.fn().mockResolvedValue([{ userId: "user-id" }]);
		const module = await Test.createTestingModule({
			providers: [AuthIdentityRepository, { provide: PrismaService, useValue: { $queryRaw: queryRaw } }],
		}).compile();

		const result = await module.get(AuthIdentityRepository).saveVerifiedIdentityAndContact({
			provider: AuthIdentityProvider.WHATSAPP,
			providerSubject: "user.9373795779eb6441c8adb2eaee5b848e7dd174ddd302d7db62142f4722d574b6",
			lastVerifiedAt: new Date("2026-08-05T15:00:00.000Z"),
			contactMethod: JobContactMethod.WHATSAPP,
			contactIdentifier: "+5511999999999",
		});

		expect(result).toBe("user-id");
		expect(queryRaw).toHaveBeenCalledTimes(1);

		const query: unknown = queryRaw.mock.calls[0]?.[0];
		expect(query).toBeInstanceOf(Prisma.Sql);
		if (!(query instanceof Prisma.Sql)) throw new Error("Expected verified identity persistence to use Prisma SQL");

		expect(query.text).toContain('SELECT "public"."save_verified_identity_and_contact"(');
		expect(query.text).not.toContain("user.9373795779eb6441c8adb2eaee5b848e7dd174ddd302d7db62142f4722d574b6");
		expect(query.text).not.toContain("+5511999999999");

		expect(query.values).toEqual([
			AuthIdentityProvider.WHATSAPP,
			"user.9373795779eb6441c8adb2eaee5b848e7dd174ddd302d7db62142f4722d574b6",
			new Date("2026-08-05T15:00:00.000Z"),
			JobContactMethod.WHATSAPP,
			"+5511999999999",
			expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
			expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
			expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
		]);
	});

	it("should give each first-time verification attempt independent candidate identifiers", async () => {
		const queryRaw = vi.fn().mockResolvedValue([{ userId: "winning-user-id" }]);
		const module = await Test.createTestingModule({
			providers: [AuthIdentityRepository, { provide: PrismaService, useValue: { $queryRaw: queryRaw } }],
		}).compile();

		const repository = module.get(AuthIdentityRepository);
		const input = {
			provider: AuthIdentityProvider.WHATSAPP,
			providerSubject: "+5511999999999",
			lastVerifiedAt: new Date("2026-08-05T15:00:00.000Z"),
			contactMethod: JobContactMethod.WHATSAPP,
			contactIdentifier: "+5511999999999",
		};
		await Promise.all([
			repository.saveVerifiedIdentityAndContact(input),
			repository.saveVerifiedIdentityAndContact(input),
		]);

		const queries: unknown[] = queryRaw.mock.calls.map((call) => call[0]);
		const candidateIdentifiers = queries.flatMap((query) => {
			if (!(query instanceof Prisma.Sql)) {
				throw new Error("Expected verified identity persistence to use Prisma SQL");
			}

			return query.values.slice(5);
		});

		expect(new Set(candidateIdentifiers).size).toBe(6);
	});

	it("should fail if the database cannot resolve exactly one verified identity", async () => {
		const module = await Test.createTestingModule({
			providers: [
				AuthIdentityRepository,
				{ provide: PrismaService, useValue: { $queryRaw: vi.fn().mockResolvedValue([]) } },
			],
		}).compile();

		const result = module.get(AuthIdentityRepository).saveVerifiedIdentityAndContact({
			provider: AuthIdentityProvider.WHATSAPP,
			providerSubject: "+5511999999999",
			lastVerifiedAt: new Date("2026-08-05T15:00:00.000Z"),
			contactMethod: JobContactMethod.WHATSAPP,
			contactIdentifier: "+5511999999999",
		});

		await expect(result).rejects.toThrow("Verified identity and contact persistence returned no user");
	});

	it("should preserve database failures for the global error boundary", async () => {
		const databaseError = new Error("database unavailable");
		const module = await Test.createTestingModule({
			providers: [
				AuthIdentityRepository,
				{ provide: PrismaService, useValue: { $queryRaw: vi.fn().mockRejectedValue(databaseError) } },
			],
		}).compile();

		const result = module.get(AuthIdentityRepository).saveVerifiedIdentityAndContact({
			provider: AuthIdentityProvider.WHATSAPP,
			providerSubject: "+5511999999999",
			lastVerifiedAt: new Date("2026-08-05T15:00:00.000Z"),
			contactMethod: JobContactMethod.WHATSAPP,
			contactIdentifier: "+5511999999999",
		});

		await expect(result).rejects.toBe(databaseError);
	});
});
