import { Test } from "@nestjs/testing";
import { databaseConfig } from "../config/database.config";
import { PrismaService } from "./prisma.service";

let prismaNeonConfigs: Record<string, unknown>[] = [];

const MockPrismaNeon = vi.hoisted(() => {
	return class {
		readonly provider = "postgres";
		readonly adapterName = "neon";
		readonly connect = vi.fn();

		constructor(config: Record<string, unknown>) {
			prismaNeonConfigs.push(config);
		}
	};
});

vi.mock("@prisma/adapter-neon", () => ({
	PrismaNeon: MockPrismaNeon,
}));

const MOCK_CONFIG = databaseConfig();

describe("PrismaService", () => {
	let prismaService: PrismaService;

	beforeEach(async () => {
		prismaNeonConfigs = [];
		vi.clearAllMocks();

		const module = await Test.createTestingModule({
			providers: [
				{
					provide: databaseConfig.KEY,
					useValue: MOCK_CONFIG,
				},
				PrismaService,
			],
		}).compile();

		prismaService = module.get(PrismaService);
	});

	it("should be defined", () => {
		expect(prismaService).toBeDefined();
	});

	it("should pass appPoolerUrl as connectionString to PrismaNeon", () => {
		expect(prismaNeonConfigs[0]).toMatchObject({
			connectionString: MOCK_CONFIG.appPoolerUrl,
		});
	});

	it("should pass statement_timeout from config to PrismaNeon", () => {
		expect(prismaNeonConfigs[0]).toMatchObject({
			statement_timeout: MOCK_CONFIG.statementTimeoutMs,
		});
	});

	it("should pass query_timeout from config to PrismaNeon", () => {
		expect(prismaNeonConfigs[0]).toMatchObject({
			query_timeout: MOCK_CONFIG.queryTimeoutMs,
		});
	});

	it("should pass lock_timeout from config to PrismaNeon", () => {
		expect(prismaNeonConfigs[0]).toMatchObject({
			lock_timeout: MOCK_CONFIG.lockTimeoutMs,
		});
	});

	it("should pass connectionTimeoutMillis from config to PrismaNeon", () => {
		expect(prismaNeonConfigs[0]).toMatchObject({
			connectionTimeoutMillis: MOCK_CONFIG.connectionTimeoutMs,
		});
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
});
