import fc from "fast-check";
import { LocaleConstants } from "./locale.constants";
import { LocaleUtils } from "./locale.utils";

describe("formatBcp47LocaleTag", () => {
	it("should return language-lowercase region-uppercase for any valid input (property-based)", () => {
		fc.assert(
			fc.property(fc.stringMatching(/^[a-zA-Z]{2}(-[a-zA-Z0-9]{2,8})?$/), (input) => {
				const result = LocaleUtils.formatBcp47LocaleTag(input);

				expect(result).toMatch(/^[a-z]{2}(-[A-Z0-9]{2,8})?$/);
			}),
		);
	});

	it("should not change the value on a second pass (property-based)", () => {
		fc.assert(
			fc.property(fc.stringMatching(/^[a-zA-Z]{2}(-[a-zA-Z0-9]{2,8})?$/), (input) => {
				const once = LocaleUtils.formatBcp47LocaleTag(input);
				const twice = LocaleUtils.formatBcp47LocaleTag(once);

				expect(twice).toBe(once);
			}),
		);
	});

	it("should convert pt-br to pt-BR", () => {
		const result = LocaleUtils.formatBcp47LocaleTag("pt-br");

		expect(result).toBe("pt-BR");
	});

	it("should convert EN-US to en-US", () => {
		const result = LocaleUtils.formatBcp47LocaleTag("EN-US");

		expect(result).toBe("en-US");
	});

	it("should convert Es-Mx to es-MX", () => {
		const result = LocaleUtils.formatBcp47LocaleTag("Es-Mx");

		expect(result).toBe("es-MX");
	});

	it("should leave en-US unchanged", () => {
		const result = LocaleUtils.formatBcp47LocaleTag("en-US");

		expect(result).toBe("en-US");
	});

	it("should return lowercase for single language code", () => {
		const result = LocaleUtils.formatBcp47LocaleTag("EN");

		expect(result).toBe("en");
	});

	it("should leave single lowercase language code unchanged", () => {
		const result = LocaleUtils.formatBcp47LocaleTag("en");

		expect(result).toBe("en");
	});

	it("should return empty string for empty input", () => {
		const result = LocaleUtils.formatBcp47LocaleTag("");

		expect(result).toBe("");
	});
});

describe("resolveLocalizedString", () => {
	it("should return translation for requested locale when it exists", () => {
		const translations = [
			{ locale: "en-US", string: "Moving Help" },
			{ locale: "es-MX", string: "Ayuda con mudanza" },
		];

		const result = LocaleUtils.resolveLocalizedString({
			translations: translations,
			targetLocale: "es-MX",
		});

		expect(result).toBe("Ayuda con mudanza");
	});

	it("should fall back to default locale translation when requested locale is not found", () => {
		const translations = [
			{ locale: "en-US", string: "Moving Help" },
			{ locale: "es-MX", string: "Ayuda con mudanza" },
		];

		const result = LocaleUtils.resolveLocalizedString({
			translations: translations,
			targetLocale: "fr-FR",
		});

		expect(result).toBe("Moving Help");
	});

	it("should fall back to first available translation when neither requested nor default locale exists", () => {
		const translations = [
			{ locale: "es-MX", string: "Ayuda con mudanza" },
			{ locale: "pt-BR", string: "Ajuda com mudança" },
		];

		const result = LocaleUtils.resolveLocalizedString({
			translations: translations,
			targetLocale: "fr-FR",
		});

		expect(result).toBe("Ayuda con mudanza");
	});

	it("should return undefined when no translations exist", () => {
		const translations: Array<{ locale: string; string: string }> = [];

		const result = LocaleUtils.resolveLocalizedString({
			translations: translations,
			targetLocale: "fr-FR",
		});

		expect(result).toBeUndefined();
	});

	it("should return requested locale when it matches default locale", () => {
		const translations = [
			{ locale: "en-US", string: "Moving Help" },
			{ locale: "es-MX", string: "Ayuda con mudanza" },
		];

		const result = LocaleUtils.resolveLocalizedString({
			translations: translations,
			targetLocale: LocaleConstants.DEFAULT_LOCALE,
		});

		expect(result).toBe("Moving Help");
	});

	it("should not fall back to default locale when requested locale exists but default locale does not", () => {
		const translations = [
			{ locale: "fr-FR", string: "Aide au déménagement" },
			{ locale: "es-MX", string: "Ayuda con mudanza" },
		];

		const result = LocaleUtils.resolveLocalizedString({
			translations: translations,
			targetLocale: "fr-FR",
		});

		expect(result).toBe("Aide au déménagement");
	});

	it("should return translation when locale casing differs from DB casing", () => {
		const translations = [
			{ locale: "es-mx", string: "Ayuda con mudanza" },
			{ locale: "en-US", string: "Moving Help" },
		];

		const result = LocaleUtils.resolveLocalizedString({
			translations: translations,
			targetLocale: "es-MX",
		});

		expect(result).toBe("Ayuda con mudanza");
	});

	it("should return translation when DB locale casing differs from requested casing", () => {
		const translations = [
			{ locale: "PT-BR", string: "Ajuda com mudança" },
			{ locale: "en-US", string: "Moving Help" },
		];

		const result = LocaleUtils.resolveLocalizedString({
			translations: translations,
			targetLocale: "pt-BR",
		});

		expect(result).toBe("Ajuda com mudança");
	});

	it("should find default locale case-insensitively when requested locale missing", () => {
		const translations = [{ locale: "EN-US", string: "Moving Help" }];

		const result = LocaleUtils.resolveLocalizedString({
			translations: translations,
			targetLocale: "fr-FR",
		});

		expect(result).toBe("Moving Help");
	});
});
