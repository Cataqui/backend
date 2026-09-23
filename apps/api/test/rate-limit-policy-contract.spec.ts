import type { Type } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { THROTTLER_LIMIT, THROTTLER_TTL } from "@nestjs/throttler/dist/throttler.constants";
import { AppController } from "../src/app.controller";
import { ContactController } from "../src/modules/contact/contact.controller";
import { RateLimitConstants } from "../src/core/throttle/rate-limit.constants";
import { AuthSessionController } from "../src/modules/auth/auth-session.controller";
import { NotpController } from "../src/modules/auth/notp/notp.controller";
import { NotpInboundController } from "../src/modules/auth/notp/notp.inbound.controller";
import { MicroservicesAuthController } from "../src/modules/auth/microservices-auth/microservices-auth.controller";
import { FeedController } from "../src/modules/feed/feed.controller";
import { HealthController } from "../src/modules/health/health.controller";
import { JobController } from "../src/modules/job/job.controller";

const reflector = new Reflector();

function _getPolicy(
	controller: Type<unknown>,
	methodName: string,
): { requests: number | undefined; milliseconds: number | undefined } {
	const method = (controller.prototype as Record<string, (...params: never[]) => unknown>)[methodName];
	if (method === undefined) throw new Error(`${controller.name}.${methodName} is not an endpoint method.`);
	const targets = [method, controller];

	return {
		requests: reflector.getAllAndOverride(`${THROTTLER_LIMIT}${RateLimitConstants.THROTTLER_NAME}`, targets),
		milliseconds: reflector.getAllAndOverride(`${THROTTLER_TTL}${RateLimitConstants.THROTTLER_NAME}`, targets),
	};
}

describe("endpoint rate-limit policy contract", () => {
	it.each([["direct job posting", JobController, "createJob", 20, 3_600_000]] as const)(
		"should protect %s with its authenticated-user budget",
		(_name, controller, method, requests, milliseconds) => {
			expect(_getPolicy(controller, method)).toEqual({ requests: requests, milliseconds: milliseconds });
		},
	);

	it.each([
		["app discovery", AppController, "root"],
		["dependency health", HealthController, "check"],
		["feed pagination", FeedController, "getFeed"],
		["job detail", JobController, "getJob"],
		["contact reveal", ContactController, "getContact"],
		["session refresh", AuthSessionController, "refreshSession"],
		["session inspection", AuthSessionController, "getCurrentSession"],
		["current-session logout", AuthSessionController, "logoutCurrentSession"],
		["all-session revocation", AuthSessionController, "revokeAllSessions"],
		["NOTP intent creation", NotpController, "createIntent"],
		["NOTP intent exchange", NotpController, "exchangeIntentForSession"],
		["geosearch access-token issuance", MicroservicesAuthController, "createGeosearchAccessToken"],
		["direct WhatsApp auth verification", NotpInboundController, "verifyWhatsappNotp"],
	] as const)("should leave %s without an application-level request budget", (_name, controller, method) => {
		expect(_getPolicy(controller, method)).toEqual({ requests: undefined, milliseconds: undefined });
	});
});
