import type { PrismaNeon } from "@prisma/adapter-neon";
import * as td from "testdouble";
import { databaseConfig } from "../config/database.config";
import { PrismaService } from "./prisma.service";

afterEach(() => td.reset());

const _neon = await vi.hoisted(async () => {
	const td = await import("testdouble");
	return { construct: td.func<(config: Record<string, unknown>) => void>() };
});

vi.mock("@prisma/adapter-neon", async () => {
	const td = await import("testdouble");
	return {
		PrismaNeon: class {
			readonly provider = "postgres";
			readonly adapterName = "neon";
			readonly connect = td.func<PrismaNeon["connect"]>();

			constructor(config: Record<string, unknown>) {
				_neon.construct(config);
			}
		},
	};
});

describe("PrismaService", () => {
	it("should be defined", () => {
		const config = databaseConfig();
		const prismaService = new PrismaService(config);
		expect(prismaService).toBeDefined();
	});

	it("should pass appPoolerUrl as connectionString to PrismaNeon", () => {
		const config = databaseConfig();
		new PrismaService(config);
		expect(td.explain(_neon.construct).calls[0]?.args[0]).toMatchObject({
			connectionString: config.appPoolerUrl,
		});
	});

	it("should keep the configured minimum number of warm Neon pool connections", () => {
		const config = databaseConfig();
		new PrismaService(config);
		expect(td.explain(_neon.construct).calls[0]?.args[0]).toMatchObject({
			min: config.minimumPoolConnections,
		});
	});

	it("should pass statement_timeout from config to PrismaNeon", () => {
		const config = databaseConfig();
		new PrismaService(config);
		expect(td.explain(_neon.construct).calls[0]?.args[0]).toMatchObject({
			statement_timeout: config.statementTimeoutMs,
		});
	});

	it("should pass query_timeout from config to PrismaNeon", () => {
		const config = databaseConfig();
		new PrismaService(config);
		expect(td.explain(_neon.construct).calls[0]?.args[0]).toMatchObject({
			query_timeout: config.queryTimeoutMs,
		});
	});

	it("should pass lock_timeout from config to PrismaNeon", () => {
		const config = databaseConfig();
		new PrismaService(config);
		expect(td.explain(_neon.construct).calls[0]?.args[0]).toMatchObject({
			lock_timeout: config.lockTimeoutMs,
		});
	});

	it("should pass connectionTimeoutMillis from config to PrismaNeon", () => {
		const config = databaseConfig();
		new PrismaService(config);
		expect(td.explain(_neon.construct).calls[0]?.args[0]).toMatchObject({
			connectionTimeoutMillis: config.connectionTimeoutMs,
		});
	});

	it("should call $connect on module init", async () => {
		const config = databaseConfig();
		const prismaService = new PrismaService(config);
		const connectSpy = td.replace(prismaService, "$connect");

		await prismaService.onModuleInit();

		td.verify(connectSpy(), { times: 1 });
	});

	it("should not throw when $connect fails", async () => {
		const config = databaseConfig();
		const prismaService = new PrismaService(config);
		td.when(td.replace(prismaService, "$connect")()).thenReject(new Error("Connection refused"));

		await expect(prismaService.onModuleInit()).resolves.toBeUndefined();
	});

	it("should call $disconnect on module destroy", async () => {
		const config = databaseConfig();
		const prismaService = new PrismaService(config);
		const disconnectSpy = td.replace(prismaService, "$disconnect");

		await prismaService.onModuleDestroy();

		td.verify(disconnectSpy(), { times: 1 });
	});
});
