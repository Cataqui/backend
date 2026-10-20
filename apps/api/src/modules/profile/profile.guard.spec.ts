import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import * as td from "testdouble";
import { Public } from "../authentication/decorators/public.decorator";
import type { IAuthenticatedRequest } from "../authentication/interfaces/authenticated-request.interface";
import { ProfileRequired } from "./decorators/profile-required.decorator";
import { ProfileRequiredError } from "./errors/profile-required.error";
import { ProfileGuard } from "./profile.guard";
import type { ProfileService } from "./profile.service";

afterEach(() => td.reset());

class RoutesFixture {
	@ProfileRequired()
	protectedRoute(): void {}
	ordinaryRoute(): void {}
}

@ProfileRequired()
class RequiredControllerFixture {
	handle(): void {}
}

@Public()
@ProfileRequired()
class PublicControllerFixture {
	handle(): void {}
}

function _context(params: {
	controller?: ReturnType<ExecutionContext["getClass"]>;
	handler?: ReturnType<ExecutionContext["getHandler"]>;
}): ExecutionContext {
	const context = td.object<ExecutionContext>();
	const http = td.object<ReturnType<ExecutionContext["switchToHttp"]>>();
	const request = Object.assign(td.object<IAuthenticatedRequest>(), {
		authSession: { accountId: "account", sessionId: "session", expiresAt: "2026-10-19T15:00:00.000Z" },
	});
	td.when(context.getHandler()).thenReturn(params.handler ?? RoutesFixture.prototype.protectedRoute);
	td.when(context.getClass()).thenReturn(params.controller ?? RoutesFixture);
	td.when(context.switchToHttp()).thenReturn(http);
	td.when(http.getRequest<IAuthenticatedRequest>()).thenReturn(request);
	return context;
}

describe("ProfileGuard", () => {
	let profileService: ProfileService;
	let guard: ProfileGuard;
	beforeEach(() => {
		profileService = td.object<ProfileService>();
		guard = new ProfileGuard(new Reflector(), profileService);
	});

	it("checks the authenticated account once for marked handlers", async () => {
		await expect(guard.canActivate(_context({}))).resolves.toBe(true);
		expect(td.explain(profileService.requireExists).calls.map((call) => call.args)).toEqual([
			[{ profileId: "account" }],
		]);
	});

	it("supports a requirement on the controller", async () => {
		await expect(
			guard.canActivate(
				_context({ controller: RequiredControllerFixture, handler: RequiredControllerFixture.prototype.handle }),
			),
		).resolves.toBe(true);
		expect(td.explain(profileService.requireExists).callCount).toBe(1);
	});

	it("does not look up profiles on unmarked routes", async () => {
		const context = _context({ handler: RoutesFixture.prototype.ordinaryRoute });
		await expect(guard.canActivate(context)).resolves.toBe(true);
		expect(td.explain(profileService.requireExists).callCount).toBe(0);
		expect(td.explain(context.switchToHttp).callCount).toBe(0);
	});

	it("allows public controllers even when marked as profile-required", async () => {
		await expect(
			guard.canActivate(
				_context({ controller: PublicControllerFixture, handler: PublicControllerFixture.prototype.handle }),
			),
		).resolves.toBe(true);
		expect(td.explain(profileService.requireExists).callCount).toBe(0);
	});

	it.each([new ProfileRequiredError(), new Error("database unavailable")])(
		"preserves lookup failures: %s",
		async (error) => {
			td.when(profileService.requireExists({ profileId: "account" })).thenReject(error);
			await expect(guard.canActivate(_context({}))).rejects.toBe(error);
		},
	);
});
