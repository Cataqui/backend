import * as td from "testdouble";
import { HealthRepository } from "./health.repository";
import { HealthService } from "./health.service";

afterEach(() => td.reset());

describe("HealthService", () => {
	it("is ready only when both storage operations succeed", async () => {
		const repository = td.object<HealthRepository>();
		td.when(repository.readDatabase()).thenResolve([{ value: 1 }]);
		td.when(repository.readRedis()).thenResolve("PONG");

		expect(await new HealthService(repository).check()).toBe(true);
	});

	it.each(["database", "redis", "both"])(
		"reports unavailable when %s fails while still checking both dependencies",
		async (failure) => {
			const repository = td.object<HealthRepository>();
			if (failure === "database" || failure === "both")
				td.when(repository.readDatabase()).thenReject(new Error("database unavailable"));
			else td.when(repository.readDatabase()).thenResolve([]);
			if (failure === "redis" || failure === "both")
				td.when(repository.readRedis()).thenReject(new Error("redis unavailable"));
			else td.when(repository.readRedis()).thenResolve("PONG");

			expect(await new HealthService(repository).check()).toBe(false);
		},
	);
});
