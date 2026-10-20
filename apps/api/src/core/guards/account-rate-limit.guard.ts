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
import type { IAuthenticatedRequest } from "../../modules/authentication/interfaces/authenticated-request.interface";
import { RateLimitedError } from "../errors/rate-limited.error";

@Injectable()
export class AccountRateLimitGuard extends ThrottlerGuard {
	constructor(
		@InjectThrottlerOptions() options: ThrottlerModuleOptions,
		@InjectThrottlerStorage() storageService: ThrottlerStorage,
		reflector: Reflector,
	) {
		super(options, storageService, reflector);
	}

	protected override getTracker(request: IAuthenticatedRequest): Promise<string> {
		return Promise.resolve(request.authSession.accountId);
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
