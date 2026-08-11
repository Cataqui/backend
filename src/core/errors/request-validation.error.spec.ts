import { HttpStatus } from "@nestjs/common";
import { ErrorCode } from "./error-code.enum";
import { RequestValidationError } from "./request-validation.error";

describe("RequestValidationError", () => {
	it("should expose the stable validation response with structured violations", () => {
		const error = new RequestValidationError({
			violations: [{ path: ["payment", "minAmount"], message: "must be greater than 0" }],
		});

		expect({ status: error.getStatus(), response: error.getResponse() }).toEqual({
			status: HttpStatus.BAD_REQUEST,
			response: {
				errorCode: ErrorCode.VALIDATION_ERROR,
				message: "The request contains invalid fields.",
				violations: [{ path: ["payment", "minAmount"], message: "must be greater than 0" }],
			},
		});
	});
});
