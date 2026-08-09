import { Controller, type CanActivate, Get } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";
import { AccessTokenGuard } from "../guards/access-token.guard";
import { AccessTokenRequired } from "./access-token-required.decorator";

class GuardAfterAccessToken implements CanActivate {
	canActivate(): boolean {
		return true;
	}
}

@Controller("access-token-required-test")
@AccessTokenRequired()
class AccessTokenRequiredController {
	@Get()
	get(): void {}
}

@Controller("access-token-required-method-test")
class AccessTokenRequiredMethodController {
	@Get()
	@AccessTokenRequired(GuardAfterAccessToken)
	get(): void {}
}

describe("AccessTokenRequired", () => {
	it("should require an access token for every endpoint in a decorated controller", () => {
		expect(Reflect.getMetadata(GUARDS_METADATA, AccessTokenRequiredController)).toEqual([AccessTokenGuard]);
	});

	it("should run additional guards after access-token authentication", () => {
		expect(Reflect.getMetadata(GUARDS_METADATA, AccessTokenRequiredMethodController.prototype.get)).toEqual([
			AccessTokenGuard,
			GuardAfterAccessToken,
		]);
	});
});
