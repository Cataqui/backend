import { isDeepStrictEqual } from "node:util";
import fc from "fast-check";
import { Prisma } from "../../../../generated/prisma/client";
import { toFuzzyJobLocationOutput } from "./fuzzy-job-location-output.mapper";

it("converts numeric and decimal fuzzy coordinates while preserving the supplied image URL", () => {
	fc.assert(
		fc.property(
			fc.double({ min: -90, max: 90, noNaN: true, noDefaultInfinity: true }),
			fc.double({ min: -180, max: 180, noNaN: true, noDefaultInfinity: true }),
			fc.boolean(),
			fc.boolean(),
			fc.uuid(),
			(latitude, longitude, decimalLatitude, decimalLongitude, imageId) =>
				isDeepStrictEqual(
					toFuzzyJobLocationOutput({
						fuzzyLatitude: decimalLatitude ? new Prisma.Decimal(latitude) : latitude,
						fuzzyLongitude: decimalLongitude ? new Prisma.Decimal(longitude) : longitude,
						locationImageUrl: `https://imagedelivery.net/test/${imageId}/format=webp,quality=80`,
					}),
					{
						latitude: latitude,
						longitude: longitude,
						areaRadius: 2000,
						imageUrl: `https://imagedelivery.net/test/${imageId}/format=webp,quality=80`,
					},
				),
		),
	);
});

it.each([
	{ latitude: -90, longitude: -180 },
	{ latitude: 90, longitude: 180 },
	{ latitude: 0, longitude: 0 },
])("preserves geographic boundary coordinates $latitude, $longitude without fuzzing", (coordinates) => {
	expect(
		toFuzzyJobLocationOutput({
			fuzzyLatitude: coordinates.latitude,
			fuzzyLongitude: coordinates.longitude,
			locationImageUrl: "https://imagedelivery.net/test/map/format=webp,quality=80",
		}),
	).toEqual({
		...coordinates,
		areaRadius: 2000,
		imageUrl: "https://imagedelivery.net/test/map/format=webp,quality=80",
	});
});
