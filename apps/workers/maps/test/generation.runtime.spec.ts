import { LandmarkRepository } from "../src/landmarks/landmark.repository";
import { exports } from "cloudflare:workers";
import { StaticRepository } from "../src/modules/static/static.repository";

afterEach(() => vi.restoreAllMocks());
it("generates the complete 2x map set through private Worker and Durable Object RPC", async () => {
	vi.spyOn(LandmarkRepository.prototype, "findPlaces").mockResolvedValue([]);
	vi.spyOn(StaticRepository.prototype, "findImage").mockResolvedValue(false);
	vi.spyOn(StaticRepository.prototype, "generateImage").mockResolvedValue(new Uint8Array([1]));
	vi.spyOn(StaticRepository.prototype, "upload").mockResolvedValue(undefined);
	vi.spyOn(StaticRepository.prototype, "encode").mockResolvedValue(new Uint8Array([2]));
	expect(await exports.MapsEntrypoint.generateStaticMaps({ latitude: -23.51, longitude: -46.61 })).toMatchObject({
		kind: "ready",
		asset: { id: expect.stringMatching(/^[a-f0-9]{64}$/), url: expect.stringMatching(/\/static\/[a-f0-9]{64}$/) },
	});
});
it("rejects caller-specified rendering settings at RPC ingress", async () => {
	const input = { latitude: 0, longitude: 0, density: 1 };
	expect(await exports.MapsEntrypoint.generateStaticMaps(input)).toMatchObject({
		kind: "failed",
		code: "INVALID_INPUT",
		retryable: false,
	});
});
it("keeps generation off the public HTTP route", async () => {
	expect((await exports.default.fetch("https://maps.test/v1/images?latitude=0&longitude=0")).status).toBe(404);
});
