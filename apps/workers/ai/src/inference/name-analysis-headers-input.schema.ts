import { z } from "zod";

export const NameAnalysisHeadersInputSchema = z.object({
	"accept-language": z.string({ error: "Expected a valid language tag." }).transform((value, context) => {
		let language: string | undefined;
		try {
			language = Intl.getCanonicalLocales(value.split(",", 1)[0]?.split(";", 1)[0]?.trim() ?? "")[0];
		} catch {
			language = undefined;
		}
		if (language !== undefined) return language;
		context.addIssue({ code: "custom", message: "Expected a valid language tag." });
		return z.NEVER;
	}),
});
