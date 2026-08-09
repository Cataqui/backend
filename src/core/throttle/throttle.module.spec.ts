import { readFileSync } from "node:fs";

describe("ThrottleModule production imports", () => {
	it("should avoid private Nest package imports that Node ESM cannot resolve", () => {
		const source = readFileSync(new URL("./throttle.module.ts", import.meta.url), "utf8");

		expect(source).not.toContain("@nestjs/throttler/dist/");
	});
});
