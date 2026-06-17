import { LocaleConstants } from "./locale.constants";
import { LocaleUtils } from "./locale.utils";

describe("resolveLocalizedName", () => {
	it("should return translation for requested locale when it exists", () => {
		const translations = [
			{ locale: "en-US", name: "Moving Help" },
			{ locale: "es-MX", name: "Ayuda con mudanza" },
		];

		const result = LocaleUtils.resolveLocalizedName(translations, "es-MX");

		expect(result).toBe("Ayuda con mudanza");
	});

	it("should fall back to default locale translation when requested locale is not found", () => {
		const translations = [
			{ locale: "en-US", name: "Moving Help" },
			{ locale: "es-MX", name: "Ayuda con mudanza" },
		];

		const result = LocaleUtils.resolveLocalizedName(translations, "fr-FR");

		expect(result).toBe("Moving Help");
	});

	it("should fall back to first available translation when neither requested nor default locale exists", () => {
		const translations = [
			{ locale: "es-MX", name: "Ayuda con mudanza" },
			{ locale: "pt-BR", name: "Ajuda com mudança" },
		];

		const result = LocaleUtils.resolveLocalizedName(translations, "fr-FR");

		expect(result).toBe("Ayuda con mudanza");
	});

	it("should return undefined when no translations exist", () => {
		const translations: Array<{ locale: string; name: string }> = [];

		const result = LocaleUtils.resolveLocalizedName(translations, "fr-FR");

		expect(result).toBeUndefined();
	});

	it("should return requested locale when it matches default locale", () => {
		const translations = [
			{ locale: "en-US", name: "Moving Help" },
			{ locale: "es-MX", name: "Ayuda con mudanza" },
		];

		const result = LocaleUtils.resolveLocalizedName(translations, LocaleConstants.DEFAULT_LOCALE);

		expect(result).toBe("Moving Help");
	});

	it("should not fall back to default locale when requested locale exists but default locale does not", () => {
		const translations = [
			{ locale: "fr-FR", name: "Aide au déménagement" },
			{ locale: "es-MX", name: "Ayuda con mudanza" },
		];

		const result = LocaleUtils.resolveLocalizedName(translations, "fr-FR");

		expect(result).toBe("Aide au déménagement");
	});
});
