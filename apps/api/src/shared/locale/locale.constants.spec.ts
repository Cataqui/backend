import { LocaleConstants } from "./locale.constants";

describe("DEFAULT_LOCALE", () => {
	it("should be en-US", () => {
		expect(LocaleConstants.DEFAULT_LOCALE).toBe("en-US");
	});
});
