import { Test } from "@nestjs/testing";
import { Logger } from "@nestjs/common";
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

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
	});

	it("should be defined", () => {
		expect(prismaService).toBeDefined();
	});

	it("should pass appPoolerUrl as connectionString to PrismaNeon", () => {
		expect(prismaNeonConfigs[0]).toMatchObject({
			connectionString: MOCK_CONFIG.appPoolerUrl,
		});
	});

	it("should keep the configured minimum number of warm Neon pool connections", () => {
		expect(prismaNeonConfigs[0]).toMatchObject({
			min: MOCK_CONFIG.minimumPoolConnections,
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
		vi.spyOn(prismaService, "$queryRaw").mockResolvedValue([{ result: 1 }]);
		const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);

		await prismaService.onModuleInit();

		expect({ connectCallCount: connectSpy.mock.calls.length, logCall: log.mock.calls[0] }).toEqual({
			connectCallCount: 1,
			logCall: [{ event: "api.database.connection.established", status: "READY" }],
		});
	});

	it("should not throw when $connect fails", async () => {
		vi.spyOn(prismaService, "$connect").mockRejectedValue(new Error("Connection refused"));
		const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);

		const result = await prismaService.onModuleInit();

		expect({ result: result, warning: warn.mock.calls[0]?.[0] }).toEqual({
			result: undefined,
			warning: expect.objectContaining({
				errorName: "Error",
				errorStackFrames: expect.stringContaining("prisma.service.spec.ts"),
				event: "api.database.connection.failed",
				outcome: "DEGRADED",
			}),
		});
	});

	it("should include the complete connection failure in local development", async () => {
		vi.stubEnv("NODE_ENV", "development");
		vi.spyOn(prismaService, "$connect").mockRejectedValue(new Error("Neon connection was refused"));
		const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);

		await prismaService.onModuleInit();

		expect(warn).toHaveBeenCalledWith(
			expect.objectContaining({
				errorMessage: "Neon connection was refused",
				errorStack: expect.stringContaining("prisma.service.spec.ts"),
			}),
		);
	});

	it("should call $disconnect on module destroy", async () => {
		const disconnectSpy = vi.spyOn(prismaService, "$disconnect").mockResolvedValue(undefined);
		const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);

		await prismaService.onModuleDestroy();

		expect({ disconnectCallCount: disconnectSpy.mock.calls.length, logCall: log.mock.calls[0] }).toEqual({
			disconnectCallCount: 1,
			logCall: [{ event: "api.database.connection.closed", status: "STOPPED" }],
		});
	});
});
