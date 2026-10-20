import { HttpStatus } from "@nestjs/common";
import { ErrorCode } from "../../../core/errors/error-code.enum";
import { AccessTokenRequiredError } from "./access-token-required.error";

it("identifies the missing authenticated session without exposing credentials", () => {
	const error = new AccessTokenRequiredError();
	expect(error.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
	expect(error.getResponse()).toEqual({
		errorCode: ErrorCode.ACCESS_TOKEN_REQUIRED,
		message: "A valid bearer session is required. Send the session token as Authorization: Bearer <accessToken>.",
	});
});
