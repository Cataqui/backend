import { LocaleConstants } from "./locale.constants";

describe("DEFAULT_LOCALE", () => {
	it("should be en-US", () => {
		expect(LocaleConstants.DEFAULT_LOCALE).toBe("en-US");
	});
});

describe("LOCALE_TAG_REGEX", () => {
	describe("valid BCP 47 tags", () => {
		it.each(["en-US", "pt-BR", "en", "es-MX", "zh-Hans", "de-DE"])("should accept '%s'", (tag) => {
			expect(LocaleConstants.LOCALE_TAG_REGEX.test(tag)).toBe(true);
		});
	});

	describe("invalid tags", () => {
		it.each(["!!!bad", "1234", "en_US", "", "en_US_LONG"])("should reject '%s'", (tag) => {
			expect(LocaleConstants.LOCALE_TAG_REGEX.test(tag)).toBe(false);
		});
	});
});
