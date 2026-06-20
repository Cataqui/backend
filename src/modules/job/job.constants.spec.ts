import { describe, expect, it } from "vitest";
import { JobConstants } from "./job.constants";

describe("JobConstants", () => {
	it("should set the description summary max length to 100", () => {
		expect(JobConstants.DESCRIPTION_SUMMARY_MAX_LENGTH).toBe(100);
	});

	it("should be a positive number", () => {
		expect(JobConstants.DESCRIPTION_SUMMARY_MAX_LENGTH).toBeGreaterThan(0);
	});
});
