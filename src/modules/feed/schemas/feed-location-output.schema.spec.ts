import { FeedLocationOutputSchema } from "./feed-location-output.schema";

describe("FeedLocationOutputSchema", () => {
	it("should serialize the public feed location", () => {
		const output = {
			neighborhood: "Centro",
			latitude: -23.55,
			longitude: -46.63,
			areaRadius: 2000,
		};

		expect(FeedLocationOutputSchema.parse(output)).toEqual(output);
	});
});
