import { z } from "zod";

const _invalidLanguageMessage = "Expected a valid language tag.";

export const PlaceSearchLanguageSchema = z
	.string({ error: _invalidLanguageMessage })
	.transform((acceptLanguage, context) => {
		let languageCode: string | undefined;

		try {
			languageCode = Intl.getCanonicalLocales(acceptLanguage.split(",", 1)[0]?.split(";", 1)[0]?.trim() ?? "")[0];
		} catch {
			languageCode = undefined;
		}

		if (languageCode !== undefined) return languageCode;

		context.addIssue({ code: "custom", message: _invalidLanguageMessage });
		return z.NEVER;
	});
