import { LocaleConstants } from "./locale.constants";

function resolveLocalizedName(translations: ReadonlyArray<{ locale: string; name: string }>, locale: string): string | undefined {
	const requested = translations.find((t) => t.locale === locale);
	if (requested) return requested.name;

	const defaultTranslation = translations.find((t) => t.locale === LocaleConstants.DEFAULT_LOCALE);
	if (defaultTranslation) return defaultTranslation.name;

	return translations[0]?.name;
}

export const LocaleUtils = {
	resolveLocalizedName,
} as const;
