import type { z } from "zod";
import type { ValidationViolationSchema } from "./schemas/validation-violation.schema";

export function toValidationViolations(params: {
	issues: readonly { message: string; path?: readonly (PropertyKey | { key: PropertyKey })[] | undefined }[];
}): z.infer<typeof ValidationViolationSchema>[] {
	return params.issues.map((issue) => ({
		path:
			issue.path?.map((segment) => {
				const key = typeof segment === "object" ? segment.key : segment;
				return typeof key === "number" ? key : String(key);
			}) ?? [],
		message: issue.message,
	}));
}
