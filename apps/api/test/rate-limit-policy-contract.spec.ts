import type { Type } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { THROTTLER_LIMIT, THROTTLER_TTL } from "@nestjs/throttler/dist/throttler.constants";
import { AppController } from "../src/app.controller";
import { RateLimitConstants } from "../src/core/throttle/rate-limit.constants";
import { FeedController } from "../src/modules/feed/feed.controller";
import { HealthController } from "../src/modules/health/health.controller";
import { JobController } from "../src/modules/job/job.controller";
import { ProfileController } from "../src/modules/profile/profile.controller";

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
		"should protect %s with its authenticated-account budget",
		(_name, controller, method, requests, milliseconds) => {
			expect(_getPolicy(controller, method)).toEqual({ requests: requests, milliseconds: milliseconds });
		},
	);

	it.each([
		["app discovery", AppController, "root"],
		["dependency health", HealthController, "check"],
		["feed pagination", FeedController, "getFeed"],
		["job detail", JobController, "getJob"],
		["contact reveal", JobController, "getJobContact"],
		["profile creation", ProfileController, "createProfile"],
		["current profile", ProfileController, "getCurrentProfile"],
		["profile contacts", ProfileController, "getContacts"],
		["profile jobs", ProfileController, "getProfileJobs"],
		["profile job detail", ProfileController, "getProfileJob"],
	] as const)("should leave %s without an application-level request budget", (_name, controller, method) => {
		expect(_getPolicy(controller, method)).toEqual({ requests: undefined, milliseconds: undefined });
	});
});
