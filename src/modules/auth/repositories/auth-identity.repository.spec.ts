import { Test } from "@nestjs/testing";
import { AuthIdentityProvider, Prisma } from "../../../../generated/prisma/client.js";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { AuthIdentityRepository } from "./auth-identity.repository";

describe("AuthIdentityRepository", () => {
	it("should atomically create or reuse the WhatsApp identity and return its user", async () => {
		const prisma = { authIdentity: { upsert: vi.fn().mockResolvedValue({ userId: "user-id" }) } };
		const module = await Test.createTestingModule({
			providers: [AuthIdentityRepository, { provide: PrismaService, useValue: prisma }],
		}).compile();

		const result = await module.get(AuthIdentityRepository).upsertIdentity({
			provider: AuthIdentityProvider.WHATSAPP,
			providerSubject: "user.9373795779eb6441c8adb2eaee5b848e7dd174ddd302d7db62142f4722d574b6",
			lastVerifiedAt: new Date("2026-08-05T15:00:00.000Z"),
		});

		expect({ result: result, call: prisma.authIdentity.upsert.mock.calls[0]?.[0] }).toEqual({
			result: "user-id",
			call: {
				where: {
					provider_providerSubject: {
						provider: AuthIdentityProvider.WHATSAPP,
						providerSubject: "user.9373795779eb6441c8adb2eaee5b848e7dd174ddd302d7db62142f4722d574b6",
					},
				},
				update: {
					lastVerifiedAt: new Date("2026-08-05T15:00:00.000Z"),
				},
				create: {
					provider: AuthIdentityProvider.WHATSAPP,
					providerSubject: "user.9373795779eb6441c8adb2eaee5b848e7dd174ddd302d7db62142f4722d574b6",
					lastVerifiedAt: new Date("2026-08-05T15:00:00.000Z"),
					user: { create: {} },
				},
				select: { userId: true },
			},
		});
	});

	it("should reuse the winning user when concurrent identity creation reaches the unique constraint", async () => {
		const prisma = {
			authIdentity: {
				upsert: vi.fn().mockRejectedValue(
					new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
						code: "P2002",
						clientVersion: "7.8.0",
					}),
				),
				update: vi.fn().mockResolvedValue({ userId: "winning-user-id" }),
			},
		};
		const module = await Test.createTestingModule({
			providers: [AuthIdentityRepository, { provide: PrismaService, useValue: prisma }],
		}).compile();

		const result = await module.get(AuthIdentityRepository).upsertIdentity({
			provider: AuthIdentityProvider.WHATSAPP,
			providerSubject: "+5511999999999",
			lastVerifiedAt: new Date("2026-08-05T15:00:00.000Z"),
		});

		expect({ result: result, update: prisma.authIdentity.update.mock.calls[0]?.[0] }).toEqual({
			result: "winning-user-id",
			update: {
				where: {
					provider_providerSubject: {
						provider: AuthIdentityProvider.WHATSAPP,
						providerSubject: "+5511999999999",
					},
				},
				data: { lastVerifiedAt: new Date("2026-08-05T15:00:00.000Z") },
				select: { userId: true },
			},
		});
	});

	it("should preserve database failures unrelated to concurrent identity creation", async () => {
		const prisma = {
			authIdentity: {
				upsert: vi.fn().mockRejectedValue(new Error("database unavailable")),
				update: vi.fn(),
			},
		};
		const module = await Test.createTestingModule({
			providers: [AuthIdentityRepository, { provide: PrismaService, useValue: prisma }],
		}).compile();

		const result = module.get(AuthIdentityRepository).upsertIdentity({
			provider: AuthIdentityProvider.WHATSAPP,
			providerSubject: "+5511999999999",
			lastVerifiedAt: new Date("2026-08-05T15:00:00.000Z"),
		});

		await expect(result).rejects.toThrow("database unavailable");
	});
});
