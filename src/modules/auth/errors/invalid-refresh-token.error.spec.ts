import { HttpStatus } from "@nestjs/common";
import { ErrorCode } from "../../../core/errors/error-code.enum";
import { InvalidRefreshTokenError } from "./invalid-refresh-token.error";

describe("InvalidRefreshTokenError", () => {
	it("should expose one generic unauthorized contract for every unusable refresh token", () => {
		const error = new InvalidRefreshTokenError();

		expect({ errorCode: error.errorCode, message: error.message, status: error.getStatus() }).toEqual({
			errorCode: ErrorCode.INVALID_REFRESH_TOKEN,
			message: "The refresh token is invalid, expired, revoked, or already used. Authenticate again.",
			status: HttpStatus.UNAUTHORIZED,
		});
	});
});
