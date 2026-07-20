import { type ExecutionContext, Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { ThrottlerLimitDetail } from "@nestjs/throttler/dist/throttler.guard.interface";
import { RateLimitedError } from "../errors/rate-limited.error";

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
	protected override getTracker(req: {
		headers?: {
			"cf-connecting-ip"?: string;
		};
		ip: string;
	}): Promise<string> {
		const cfConnectingIp = req.headers?.["cf-connecting-ip"];

		const isDevOrTest = process.env["NODE_ENV"] === "development" || process.env["NODE_ENV"] === "test";

		if (typeof cfConnectingIp === "string" && cfConnectingIp.length > 0) {
			if (isDevOrTest || req.ip === cfConnectingIp) return Promise.resolve(cfConnectingIp);
		}

		return Promise.resolve(req.ip);
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
