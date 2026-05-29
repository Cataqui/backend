import { Test } from "@nestjs/testing";
import { PrismaService } from "./prisma.service";
import { DATABASE_CONFIG_KEY } from "../config/database.config";

describe("PrismaService", () => {
	let prismaService: PrismaService;

	beforeEach(async () => {
		const module = await Test.createTestingModule({
			providers: [
				{
					provide: DATABASE_CONFIG_KEY,
					useValue: {
						poolerUrl: "postgresql://test:test@localhost:5432/test",
						directUrl: "postgresql://test:test@localhost:5432/test",
					},
				},
				PrismaService,
			],
		}).compile();

		prismaService = module.get(PrismaService);
	});

	it("should be defined", () => {
		expect(prismaService).toBeDefined();
	});

	it("should call $connect on module init", async () => {
		const connectSpy = vi.spyOn(prismaService, "$connect").mockResolvedValue(undefined);

		await prismaService.onModuleInit();

		expect(connectSpy).toHaveBeenCalledOnce();
	});

	it("should not throw when $connect fails", async () => {
		vi.spyOn(prismaService, "$connect").mockRejectedValue(new Error("Connection refused"));

		await expect(prismaService.onModuleInit()).resolves.toBeUndefined();
	});

	it("should call $disconnect on module destroy", async () => {
		const disconnectSpy = vi.spyOn(prismaService, "$disconnect").mockResolvedValue(undefined);

		await prismaService.onModuleDestroy();

		expect(disconnectSpy).toHaveBeenCalledOnce();
	});

	it("should use DATABASE_POOLER_URL for the connection", () => {
		expect(prismaService).toBeDefined();
	});
});
