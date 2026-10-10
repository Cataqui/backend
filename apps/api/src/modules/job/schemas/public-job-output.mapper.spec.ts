import { Prisma, JobStatus } from "../../../../generated/prisma/client.js";
import { toPublicJobOutput } from "./public-job-output.mapper";

describe("toPublicJobOutput", () => {
	const job = {
		id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
		title: "Ajudante",
		description: "Ajudar",
		descriptionSummary: "Hoje",
		payment: "R$ 100",
		contact: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", contactMethod: "WHATSAPP" as const },
		fuzzyLatitude: new Prisma.Decimal(-23),
		fuzzyLongitude: new Prisma.Decimal(-46),
		locationImageUrl: "https://imagedelivery.net/test/map/format=webp,quality=80",
		status: JobStatus.ACTIVE,
		createdAt: new Date("2026-09-22T12:00:00Z"),
		updatedAt: new Date("2026-09-22T12:00:00Z"),
	};

	it("maps payment text and fuzzy location", () => {
		const result = toPublicJobOutput({
			job: job,
			location: {
				latitude: -23,
				longitude: -46,
				areaRadius: 2000,
				imageUrl: "https://imagedelivery.net/test/map/format=webp,quality=80",
			},
		});
		expect(result).toMatchObject({ payment: "R$ 100", location: { latitude: -23, longitude: -46 } });
	});

	it("maps null payment unchanged", () => {
		expect(
			toPublicJobOutput({
				job: { ...job, payment: null },
				location: {
					latitude: -23,
					longitude: -46,
					areaRadius: 2000,
					imageUrl: "https://imagedelivery.net/test/map/format=webp,quality=80",
				},
			}).payment,
		).toBeNull();
	});
	it("uses the supplied fuzzy location instead of rebuilding it from the job record", () => {
		const location = {
			latitude: -10,
			longitude: -20,
			areaRadius: 1500,
			imageUrl: "https://imagedelivery.net/test/map/format=webp,quality=80",
		};
		expect(toPublicJobOutput({ job: job, location: location }).location).toBe(location);
	});
});
