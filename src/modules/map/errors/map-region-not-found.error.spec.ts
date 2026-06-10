import { HttpStatus } from "@nestjs/common";
import { MapRegionNotFoundError } from "./map-region-not-found.error";
import { ErrorCode } from "../../../core/errors/error-code.enum";

describe("MapRegionNotFoundError", () => {
	it("should have MAP_REGION_NOT_FOUND error code", () => {
		const error = new MapRegionNotFoundError();

		expect(error.errorCode).toBe(ErrorCode.MAP_REGION_NOT_FOUND);
	});

	it("should have descriptive message", () => {
		const error = new MapRegionNotFoundError();

		expect(error.message).toBe("No map available for the requested region.");
	});

	it("should have NOT_FOUND status", () => {
		const error = new MapRegionNotFoundError();

		expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
	});
});
