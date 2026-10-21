import type { z } from "zod";
import type { ValidationViolation } from "./validation-violation.schema";

export function toValidationViolations(params: {
	issues: NonNullable<Awaited<ReturnType<z.ZodType["~standard"]["validate"]>>["issues"]>;
}): ValidationViolation[] {
	return params.issues.map((issue) => ({
		path:
			issue.path?.map((segment) => {
				const key = typeof segment === "object" ? segment.key : segment;
				if (typeof key === "symbol") return "$";
				if (typeof key === "number" && (!Number.isSafeInteger(key) || key < 0)) return String(key);
				return key;
			}) ?? [],
		message:
			"code" in issue && issue.code === "unrecognized_keys"
				? "Only documented fields are supported."
				: "code" in issue && issue.code === "invalid_union"
					? "Must match one of the supported alternatives."
					: issue.message,
	}));
}
