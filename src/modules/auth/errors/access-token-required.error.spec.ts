import { HttpStatus } from "@nestjs/common";
import { ErrorCode } from "../../../core/errors/error-code.enum";
import { AccessTokenRequiredError } from "./access-token-required.error";

describe("AccessTokenRequiredError", () => {
	it("should expose the stable access-token-required contract", () => {
		const error = new AccessTokenRequiredError();

		expect({ errorCode: error.errorCode, status: error.getStatus() }).toEqual({
			errorCode: ErrorCode.ACCESS_TOKEN_REQUIRED,
			status: HttpStatus.UNAUTHORIZED,
		});
	});
});
