function daysToMs(days: number): number {
	return days * 24 * 60 * 60 * 1000;
}

export const DateUtils = {
	daysToMs,
};
