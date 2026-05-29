import { DateUtils } from "./date.utils";

describe("DateUtils", () => {
	describe("daysToMs", () => {
		it("should convert 0 days to 0 ms", () => {
			expect(DateUtils.daysToMs(0)).toBe(0);
		});

		it("should convert 1 day to 86400000 ms", () => {
			expect(DateUtils.daysToMs(1)).toBe(86400000);
		});

		it("should convert 30 days to 2592000000 ms", () => {
			expect(DateUtils.daysToMs(30)).toBe(2592000000);
		});
	});
});
