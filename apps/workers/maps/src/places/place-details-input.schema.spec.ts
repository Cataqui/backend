import { PlaceDetailsInputSchema } from "./place-details-input.schema";

describe("PlaceDetailsInputSchema", () => {
	it("should accept provider-neutral place details input", () => {
		expect(PlaceDetailsInputSchema.parse({ placeId: " opaque-id ", sessionToken: "session" })).toEqual({
			placeId: "opaque-id",
			sessionToken: "session",
		});
	});
});
