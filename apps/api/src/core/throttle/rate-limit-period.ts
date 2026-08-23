const periodMilliseconds = {
	minute: 60_000,
	"five-minute": 5 * 60_000,
	hour: 60 * 60_000,
	day: 24 * 60 * 60_000,
} as const;

export type RateLimitPeriod = keyof typeof periodMilliseconds;

export function getRateLimitPeriodMilliseconds(params: { period: RateLimitPeriod }): number {
	return periodMilliseconds[params.period];
}
