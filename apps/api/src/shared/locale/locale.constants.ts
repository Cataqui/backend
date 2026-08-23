const DEFAULT_LOCALE = "en-US";

const LOCALE_TAG_REGEX = /^[a-z]{2}(-[a-z0-9]{2,8})?$/i;

export const LocaleConstants = {
	DEFAULT_LOCALE,
	LOCALE_TAG_REGEX,
} as const;
