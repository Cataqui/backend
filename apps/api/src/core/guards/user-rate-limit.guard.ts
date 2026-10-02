import { type ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
	InjectThrottlerOptions,
	InjectThrottlerStorage,
	ThrottlerGuard,
	type ThrottlerLimitDetail,
	type ThrottlerModuleOptions,
	type ThrottlerStorage,
} from "@nestjs/throttler";
import type { IAuthenticatedRequest } from "../../modules/auth/interfaces/authenticated-request.interface";
import { RateLimitedError } from "../errors/rate-limited.error";

@Injectable()
export class UserRateLimitGuard extends ThrottlerGuard {
	constructor(
		@InjectThrottlerOptions() options: ThrottlerModuleOptions,
		@InjectThrottlerStorage() storageService: ThrottlerStorage,
		reflector: Reflector,
	) {
		super(options, storageService, reflector);
	}

	protected override getTracker(request: Record<string, unknown>): Promise<string> {
		const authenticatedRequest = request as Partial<IAuthenticatedRequest>;
		const userId = authenticatedRequest.authSession?.userId;

		if (typeof userId !== "string" || userId.length === 0) {
			return Promise.reject(new Error("UserRateLimitGuard must run after an auth session has been attached"));
		}

		return Promise.resolve(userId);
	}

	protected override throwThrottlingException(
		_context: ExecutionContext,
		_throttlerLimitDetail: ThrottlerLimitDetail,
	): Promise<void> {
		void _context;
		void _throttlerLimitDetail;
		throw new RateLimitedError();
	}
}
