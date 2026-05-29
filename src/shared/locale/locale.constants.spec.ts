import { DEFAULT_LOCALE } from "./locale.constants";

describe("DEFAULT_LOCALE", () => {
	it("should be en-US", () => {
		expect(DEFAULT_LOCALE).toBe("en-US");
	});
});
