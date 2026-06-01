import { Injectable, type ExecutionContext } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { RateLimitedError } from "../errors/rate-limited.error";
import type { ThrottlerLimitDetail } from "@nestjs/throttler/dist/throttler.guard.interface";

function _parseForwardedFor(value: string): string | undefined {
	const ip = value.split(",")[0]?.trim();
	return ip && ip.length > 0 ? ip : undefined;
}

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
	protected override getTracker(req: {
		headers?: {
			"cf-connecting-ip"?: string;
			"x-forwarded-for"?: string;
		};
		ip: string;
	}): Promise<string> {
		const cfConnectingIp = req.headers?.["cf-connecting-ip"];

		if (typeof cfConnectingIp === "string" && cfConnectingIp.length > 0) return Promise.resolve(cfConnectingIp);

		const forwardedFor = req.headers?.["x-forwarded-for"];

		if (typeof forwardedFor === "string" && forwardedFor.length > 0) {
			const parsed = _parseForwardedFor(forwardedFor);
			if (parsed !== undefined) return Promise.resolve(parsed);
		}

		return Promise.resolve(req.ip);
	}

	protected override throwThrottlingException(_context: ExecutionContext, _throttlerLimitDetail: ThrottlerLimitDetail): Promise<void> {
		void _context;
		void _throttlerLimitDetail;
		throw new RateLimitedError();
	}
}
