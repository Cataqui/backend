import type { PrismaPg } from "@prisma/adapter-pg";
import * as td from "testdouble";
import type { PrismaClient } from "../generated/prisma/client";

const { prisma, constructPrisma, constructAdapter } = await vi.hoisted(async () => {
	const td = await import("testdouble");
	return {
		prisma: td.object<PrismaClient>(),
		constructPrisma: td.func<(options: ConstructorParameters<typeof PrismaClient>[0]) => void>(),
		constructAdapter: td.func<(options: ConstructorParameters<typeof PrismaPg>[0]) => void>(),
	};
});
vi.mock("@prisma/adapter-pg", () => ({
	PrismaPg: class {
		constructor(options: ConstructorParameters<typeof PrismaPg>[0]) {
			constructAdapter(options);
		}
	},
}));
vi.mock("../generated/prisma/client", () => ({
	PrismaClient: class {
		readonly $disconnect = prisma.$disconnect;
		constructor(options: ConstructorParameters<typeof PrismaClient>[0]) {
			constructPrisma(options);
		}
	},
}));
import { AuthDatabase } from "./auth-database";
afterEach(() => td.reset());

it("constructs Prisma with the supplied Hyperdrive connection string", () => {
	new AuthDatabase({ connectionString: "postgres://auth:password@hyperdrive/auth" });
	expect(td.explain(constructAdapter).calls[0]?.args).toEqual([
		{ connectionString: "postgres://auth:password@hyperdrive/auth" },
	]);
});
it("supplies the database adapter to Prisma", () => {
	new AuthDatabase({ connectionString: "postgres://auth:password@hyperdrive/auth" });
	expect(td.explain(constructPrisma).calls[0]?.args[0]).toMatchObject({ adapter: expect.any(Object) });
});
it("disconnects its owned Prisma client when disposed", async () => {
	await new AuthDatabase({ connectionString: "postgres://auth:password@hyperdrive/auth" }).dispose();
	td.verify(prisma.$disconnect());
});
it("preserves disconnect errors for the invocation boundary", async () => {
	const failure = new Error("disconnect unavailable");
	td.when(prisma.$disconnect()).thenReject(failure);
	await expect(
		new AuthDatabase({ connectionString: "postgres://auth:password@hyperdrive/auth" }).dispose(),
	).rejects.toBe(failure);
});
