/* eslint-disable @typescript-eslint/unbound-method */
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "./prisma.service";

describe("PrismaService", () => {
	let prismaService: PrismaService;
	let configService: ConfigService;

	beforeEach(async () => {
		configService = {
			getOrThrow: vi.fn().mockReturnValue("postgresql://test:test@localhost:5432/test"),
		} as never;

		const module = await Test.createTestingModule({
			providers: [
				{
					provide: ConfigService,
					useValue: configService,
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

	it("should use DATABASE_URL from config service", () => {
		expect(configService.getOrThrow).toHaveBeenCalledWith("DATABASE_URL");
	});
});
