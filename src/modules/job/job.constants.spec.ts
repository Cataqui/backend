import { describe, expect, it } from "vitest";
import { JobConstants } from "./job.constants";

describe("JobConstants", () => {
	it("should set the description summary max length to 100", () => {
		expect(JobConstants.DESCRIPTION_SUMMARY_MAX_LENGTH).toBe(100);
	});

	it("should set the description summary max tokens to 256", () => {
		expect(JobConstants.DESCRIPTION_SUMMARY_MAX_TOKENS).toBe(256);
	});

	it("should set the description summary timeout to 120_000", () => {
		expect(JobConstants.DESCRIPTION_SUMMARY_TIMEOUT_MS).toBe(120_000);
	});

	it("should set the description summary over-threshold to 15", () => {
		expect(JobConstants.DESCRIPTION_SUMMARY_MAX_LENGTH_OVER_PERCENTAGE).toBe(15);
	});

	it("should have a positive description summary max length", () => {
		expect(JobConstants.DESCRIPTION_SUMMARY_MAX_LENGTH).toBeGreaterThan(0);
	});

	it("should have a positive description summary max tokens", () => {
		expect(JobConstants.DESCRIPTION_SUMMARY_MAX_TOKENS).toBeGreaterThan(0);
	});

	it("should have a positive description summary timeout", () => {
		expect(JobConstants.DESCRIPTION_SUMMARY_TIMEOUT_MS).toBeGreaterThan(0);
	});

	it("should have a positive description summary over-threshold", () => {
		expect(JobConstants.DESCRIPTION_SUMMARY_MAX_LENGTH_OVER_PERCENTAGE).toBeGreaterThan(0);
	});

	it("should have a description summary over-threshold less than 100", () => {
		expect(JobConstants.DESCRIPTION_SUMMARY_MAX_LENGTH_OVER_PERCENTAGE).toBeLessThan(100);
	});
});
