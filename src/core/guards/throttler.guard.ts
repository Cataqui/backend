import { Injectable, type ExecutionContext } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { RateLimitedError } from "../errors/rate-limited.error";
import type { ThrottlerLimitDetail } from "@nestjs/throttler/dist/throttler.guard.interface";

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
	protected override throwThrottlingException(_context: ExecutionContext, _throttlerLimitDetail: ThrottlerLimitDetail): Promise<void> {
		void _context;
		void _throttlerLimitDetail;
		throw new RateLimitedError();
	}
}
