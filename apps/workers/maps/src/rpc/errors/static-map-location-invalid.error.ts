import type { ValidationViolation } from "@cataqui/response";

export class StaticMapLocationInvalidError extends TypeError {
	constructor(params: { violations: ValidationViolation[] }) {
		super(
			`Invalid static map location: ${params.violations
				.map((violation) => `${violation.path.join(".") || "input"}: ${violation.message}`)
				.join("; ")}`,
		);
		this.name = new.target.name;
	}
}
