import { franc } from "franc-min";
import { LocaleConstants } from "./locale.constants";

function formatBcp47LocaleTag(bcp47LocaleTag: string): string {
	const [language = "", region] = bcp47LocaleTag.split("-");

	if (!region) return language.toLowerCase();
	return `${language.toLowerCase()}-${region.toUpperCase()}`;
}

function resolveLocalizedString(params: {
	translations: ReadonlyArray<{ locale: string; string: string }>;
	targetLocale: string;
}): string | undefined {
	const requestedLocaleLower = params.targetLocale.toLowerCase();
	const defaultLocaleLower = LocaleConstants.DEFAULT_LOCALE.toLowerCase();

	const requested = params.translations.find((t) => t.locale.toLowerCase() === requestedLocaleLower);
	if (requested) return requested.string;

	const defaultTranslation = params.translations.find((t) => t.locale.toLowerCase() === defaultLocaleLower);
	if (defaultTranslation) return defaultTranslation.string;

	return params.translations[0]?.string;
}

function detectTextLocaleAsISO6393(text: string): string {
	return franc(text, { minLength: 1 });
}

export const LocaleUtils = {
	formatBcp47LocaleTag,
	resolveLocalizedString,
	detectTextLocaleAsISO6393,
} as const;
