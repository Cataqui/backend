import type { MapshotRenderInput } from "@cataqui/mapshot-workerhole";
import { PlaceCategory } from "@cataqui/places";
import * as td from "testdouble";
import { afterEach } from "vitest";
import type { MapSourceService } from "../source/map-source.service";
import type { PackedLandmarkRecord } from "./index/packed-landmark-record";
import { LandmarkService } from "./landmark.service";
import { LandmarkOutputSchema, type LandmarkOutput } from "./schemas/landmark-output.schema";

afterEach(() => td.reset());

const _signal = new AbortController().signal;

const _input: MapshotRenderInput = {
	center: { latitude: 0, longitude: 0 },
	zoom: 13,
	size: { width: 360, height: 360 },
};
function _request(
	input: MapshotRenderInput & { signal?: AbortSignal },
): Parameters<LandmarkService["findForRender"]>[0] {
	return {
		input: {
			center: { latitude: input.center.latitude, longitude: input.center.longitude },
			zoom: input.zoom,
			size: { width: input.size.width, height: input.size.height },
		},
		signal: input.signal ?? _signal,
	};
}
function _record(params: Partial<PackedLandmarkRecord> & { id: string }): PackedLandmarkRecord {
	return {
		id: `protomaps:pois:${params.id}`,
		label: params.label === undefined ? params.id : params.label,
		coordinates: params.coordinates ?? { latitude: 0, longitude: 0 },
		kind: params.kind ?? "museum",
		kindDetail: params.kindDetail ?? null,
		minZoom: params.minZoom === undefined ? 13 : params.minZoom,
		rank: params.rank ?? null,
		alternativeLabels: params.alternativeLabels ?? [],
	};
}
function _service(records: PackedLandmarkRecord[]): {
	service: LandmarkService;
	query: ConstructorParameters<typeof LandmarkService>[0]["queryLandmarks"];
	queryResult: PackedLandmarkRecord[];
} {
	const repository = td.object<MapSourceService>();
	const query = repository.queryLandmarks;
	const queryResult: Awaited<ReturnType<typeof query>> = records;
	td.when(query(td.matchers.anything())).thenResolve(queryResult);
	return {
		service: new LandmarkService(repository),
		query: query,
		queryResult: queryResult,
	};
}
async function _landmarks(records: PackedLandmarkRecord[]): Promise<LandmarkOutput[]> {
	const output = await _service(records).service.findForRender(_request(_input));
	for (const landmark of output) LandmarkOutputSchema.parse(landmark);
	return output;
}

describe("stored native references", () => {
	it("uses native city labels instead of custom landmarks below local detail zoom", async () => {
		const current = _service([]);
		const output = await current.service.findForRender(_request({ ..._input, zoom: 10 }));
		expect(output).toEqual([]);
		expect(td.explain(current.query).callCount).toBe(0);
	});
	it("queries landmarks for views larger than the former cell and dimension budgets", async () => {
		const current = _service([_record({ id: "1", label: "Wide view reference" })]);
		const input = { ..._input, size: { width: 8192, height: 4097 } } satisfies MapshotRenderInput;
		const output = await current.service.findForRender(_request(input));
		expect(output.map((landmark) => landmark.label)).toEqual(["Wide view reference"]);
		expect(td.explain(current.query).calls.map(({ args }) => args)).toEqual([
			[
				{
					center: { latitude: input.center.latitude, longitude: input.center.longitude },
					zoom: input.zoom,
					size: { width: input.size.width, height: input.size.height },
					signal: _signal,
				},
			],
		]);
	});
	it("returns exact provider labels and ranked geographic candidates", async () => {
		const records = [_record({ id: "1", label: "Praça São José", kind: "park" })];
		const repository = td.object<MapSourceService>();
		const query = repository.queryLandmarks;
		const queryResult: Awaited<ReturnType<typeof query>> = records;
		td.when(query(td.matchers.anything())).thenResolve(queryResult);
		const service = new LandmarkService(repository);
		const result = await service.findForRender(_request(_input));
		expect(result).toEqual([
			{
				id: records[0]!.id,
				label: "Praça São José",
				alternativeLabels: [],
				category: PlaceCategory.PARK,
				coordinates: { latitude: 0, longitude: 0 },
				sourceMinZoom: 13,
				rank: 0,
			},
		]);
	});
	it("orders major hospitals and universities by source prominence without category lanes", async () => {
		const records = [
			_record({ id: "museum", kind: "museum", minZoom: 14 }),
			_record({ id: "park", kind: "park", minZoom: 15 }),
			_record({ id: "university", kind: "university", minZoom: 13 }),
			_record({ id: "hospital", kind: "hospital", minZoom: 12 }),
		];
		expect((await _landmarks(records)).map((item) => item.category)).toEqual([
			PlaceCategory.HOSPITAL,
			PlaceCategory.EDUCATION,
			PlaceCategory.MUSEUM,
			PlaceCategory.PARK,
		]);
	});
	it("does not penalize artwork or worship references relative to their source prominence", async () => {
		const output = await _landmarks([
			_record({ id: "museum", kind: "museum", minZoom: 13 }),
			_record({ id: "church", kind: "place_of_worship", kindDetail: "christian", minZoom: 12 }),
			_record({ id: "artwork", kind: "artwork", minZoom: 11 }),
		]);
		expect(output.map((landmark) => landmark.id)).toEqual([
			"protomaps:pois:artwork",
			"protomaps:pois:church",
			"protomaps:pois:museum",
		]);
	});
	it("keeps source scale, distance, provider rank and identity ordering stable across producer permutations", async () => {
		const records = [
			_record({ id: "unranked", minZoom: 13, coordinates: { latitude: 0, longitude: 0.001 } }),
			_record({ id: "rank-two", minZoom: 13, rank: 2, coordinates: { latitude: 0, longitude: 0.001 } }),
			_record({ id: "rank-one-b", minZoom: 13, rank: 1, coordinates: { latitude: 0, longitude: 0.001 } }),
			_record({ id: "rank-one-a", minZoom: 13, rank: 1, coordinates: { latitude: 0, longitude: 0.001 } }),
			_record({ id: "nearest", minZoom: 13, rank: 99 }),
			_record({ id: "prominent", minZoom: 12, rank: 99, coordinates: { latitude: 0, longitude: 0.003 } }),
		];
		const output = await _landmarks(records);
		expect(output.map((landmark) => landmark.id)).toEqual([
			"protomaps:pois:prominent",
			"protomaps:pois:nearest",
			"protomaps:pois:rank-one-a",
			"protomaps:pois:rank-one-b",
			"protomaps:pois:rank-two",
			"protomaps:pois:unranked",
		]);
		expect(output.map((landmark) => landmark.rank)).toEqual([0, 1, 2, 3, 4, 5]);
		expect(await _landmarks(records.toReversed())).toEqual(output);
		expect(await _landmarks([records[2]!, records[5]!, records[0]!, records[4]!, records[1]!, records[3]!])).toEqual(
			output,
		);
	});
	it("forwards Protomaps metadata and uses the converted category", async () => {
		const fromProtomaps = td.replace(PlaceCategory, "fromProtomaps");
		td.when(fromProtomaps({ kind: "attraction", kindDetail: "buddhist" })).thenReturn(PlaceCategory.MUSEUM);
		expect((await _landmarks([_record({ id: "1", kind: "attraction", kindDetail: "buddhist" })]))[0]!.category).toBe(
			PlaceCategory.MUSEUM,
		);
		td.verify(fromProtomaps({ kind: "attraction", kindDetail: "buddhist" }));
	});
	it("passes complete labels to native font admission without filtering codepoints", async () => {
		const record = _record({ id: "1", label: "Nativeꎺ hospital", kind: "hospital" });
		expect((await _landmarks([record]))[0]?.label).toBe("Nativeꎺ hospital");
	});
	it("omits anchors outside the viewport", async () => {
		const records = [_record({ id: "outside", coordinates: { latitude: 1, longitude: 1 } })];
		expect(await _landmarks(records)).toEqual([]);
	});

	it("preserves shared categories for named community and pedestrian references", async () => {
		const output = await _landmarks([
			_record({ id: "community", label: "Sesc Belenzinho", kind: "community_centre", minZoom: 12 }),
			_record({ id: "pedestrian", label: "Orla de Santarém", kind: "pedestrian", minZoom: 13 }),
		]);
		expect(
			output.map((landmark) => ({ label: landmark.label, category: landmark.category, rank: landmark.rank })),
		).toEqual([
			{ label: "Sesc Belenzinho", category: PlaceCategory.COMMUNITY_CENTER, rank: 0 },
			{ label: "Orla de Santarém", category: PlaceCategory.PEDESTRIAN_AREA, rank: 1 },
		]);
	});
	it("groups nearby normalized native names with category-specific distances", async () => {
		const records = [
			_record({ id: "1", label: "Parque", kind: "park" }),
			_record({ id: "2", label: "PARQUE", kind: "park", coordinates: { latitude: 0.001, longitude: 0 } }),
			_record({ id: "3", label: "Station", kind: "station" }),
			_record({ id: "4", label: "station", kind: "station", coordinates: { latitude: 0.001, longitude: 0 } }),
			_record({ id: "5", label: "Museu", kind: "museum" }),
			_record({ id: "6", label: "museu", kind: "museum", coordinates: { latitude: 0.0001, longitude: 0 } }),
		];
		expect((await _landmarks(records)).map((item) => item.id)).toEqual([
			"protomaps:pois:1",
			"protomaps:pois:3",
			"protomaps:pois:5",
			"protomaps:pois:4",
		]);
	});
	it("orders missing source prominence after source-admitted references", async () => {
		expect((await _landmarks([_record({ id: "1", minZoom: null }), _record({ id: "2", minZoom: 13 })]))[0]!.id).toBe(
			"protomaps:pois:2",
		);
	});
	it("returns all unique candidates beyond the former 96 candidate budget", async () => {
		const records = Array.from({ length: 250 }, (_, index) =>
			_record({ id: String(index + 1), label: `Museum ${index + 1}` }),
		);
		const current = _service(records);
		const output = await current.service.findForRender(_request(_input));
		expect(output).toHaveLength(250);
		expect(new Set(output.map((landmark) => landmark.id)).size).toBe(250);
		expect(current.queryResult).toEqual(records);
	});
	it("includes native anchors across the antimeridian", async () => {
		const current = _service([_record({ id: "1", coordinates: { latitude: 0, longitude: -179.995 } })]);
		const output = await current.service.findForRender(
			_request({ ..._input, center: { latitude: 0, longitude: 179.995 } }),
		);
		expect(output).toHaveLength(1);
	});
	it("returns complete catalogue data with retained native names", async () => {
		const landmarks = [
			{
				id: "protomaps:pois:1",
				label: "Praça São José",
				alternativeLabels: ["São José Square"],
				category: PlaceCategory.PARK,
				coordinates: { latitude: 0, longitude: 0 },
				sourceMinZoom: 13,
				rank: 0,
			},
		];
		const current = _service([
			_record({ id: "1", label: "Praça São José", alternativeLabels: ["São José Square"], kind: "park" }),
		]);
		expect(await current.service.findForRender(_request(_input))).toEqual(landmarks);
	});

	it.each([null, 11, 17])("preserves source display scale through selection and caching: %j", async (minZoom) => {
		const current = _service([_record({ id: "source", minZoom: minZoom })]);
		const first = await current.service.findForRender(_request(_input));
		expect(first[0]?.sourceMinZoom).toBe(minZoom);
		first[0]!.sourceMinZoom = 99;
		const cached = await current.service.findForRender(_request(_input));
		expect(cached[0]?.sourceMinZoom).toBe(minZoom);
	});

	it("cancels before storage and after an in-flight query", async () => {
		const controller = new AbortController();
		controller.abort();
		const current = _service([]);
		await expect(
			current.service.findForRender(_request({ ..._input, signal: controller.signal })),
		).rejects.toMatchObject({
			errorCode: "ABORTED",
		});
		expect(td.explain(current.query).callCount).toBe(0);
		const pending = new AbortController();
		td.when(current.query(td.matchers.anything())).thenDo(async (): ReturnType<typeof current.query> => {
			pending.abort();
			return [];
		});
		await expect(current.service.findForRender(_request({ ..._input, signal: pending.signal }))).rejects.toMatchObject({
			errorCode: "ABORTED",
		});
	});
	it.each([
		["station", PlaceCategory.TRAIN_STATION],
		["bus_station", PlaceCategory.BUS_STATION],
		["marketplace", PlaceCategory.STORE],
		["courthouse", PlaceCategory.GOVERNMENT_OFFICE],
		["aerodrome", PlaceCategory.AIRPORT],
		["college", PlaceCategory.EDUCATION],
		["zoo", PlaceCategory.ZOO],
		["grocery", PlaceCategory.SUPERMARKET],
		["school", PlaceCategory.EDUCATION],
		["library", PlaceCategory.LIBRARY],
		["government", PlaceCategory.GOVERNMENT_OFFICE],
		["theatre", PlaceCategory.THEATER],
		["monument", PlaceCategory.ATTRACTION],
	] as const)("maps native source kind %s", async (kind, category) => {
		expect((await _landmarks([_record({ id: "1", kind: kind })]))[0]!.category).toBe(category);
	});
});

describe("native reference name groups", () => {
	it("retains all unique visible names", async () => {
		const records = Array.from({ length: 24 }, (_, index) =>
			_record({ id: String(index + 1), label: `Museum ${index + 1}` }),
		);
		const output = await _landmarks(records);
		expect(output).toHaveLength(records.length);
		expect(new Set(output.map((landmark) => landmark.label))).toEqual(new Set(records.map((record) => record.label)));
	});
	it.each([
		{ kind: "museum", threshold: 75 },
		{ kind: "station", threshold: 75 },
		{ kind: "park", threshold: 250 },
	] as const)("preserves the inclusive $threshold metre distance for $kind", async (params) => {
		const distances = [0, 25, params.threshold - 0.001, params.threshold + 0.001];
		const records = distances.map((metres, index) =>
			_record({
				id: String(index + 1),
				label: index % 2 === 0 ? "Native reference" : "NATIVE REFERENCE",
				kind: params.kind,
				coordinates: { latitude: ((metres / 6371008.8) * 180) / Math.PI, longitude: 0 },
			}),
		);
		expect((await _landmarks(records)).map((landmark) => landmark.id)).toEqual([
			"protomaps:pois:1",
			"protomaps:pois:4",
		]);
	});
	it("compares only accepted anchors rather than rejected names in a distance chain", async () => {
		const records = [0, 200, 400].map((metres, index) =>
			_record({
				id: String(index + 1),
				label: "Park",
				kind: index === 1 ? "garden" : "park",
				coordinates: { latitude: ((metres / 6371008.8) * 180) / Math.PI, longitude: 0 },
			}),
		);
		expect((await _landmarks(records)).map((landmark) => landmark.id)).toEqual([
			"protomaps:pois:1",
			"protomaps:pois:3",
		]);
	});
	it("keeps the same normalized name in independent categories", async () => {
		const records = [
			_record({ id: "1", label: "Native", kind: "museum" }),
			_record({ id: "2", label: "NATIVE", kind: "park" }),
			_record({ id: "3", label: "native", kind: "station" }),
		];
		expect((await _landmarks(records)).map((landmark) => landmark.category)).toEqual([
			PlaceCategory.MUSEUM,
			PlaceCategory.PARK,
			PlaceCategory.TRAIN_STATION,
		]);
	});
	it.each(["-", "‐", "‑", "–", "—"])("groups nearby station dash and spacing variants using %s", async (dash) => {
		const output = await _landmarks([
			_record({
				id: "preferred",
				label: "Palmeiras-Barra Funda",
				kind: "station",
				minZoom: 14,
			}),
			_record({
				id: "variant",
				label: `PALMEIRAS ${dash} BARRA FUNDA`,
				kind: "station",
				minZoom: 16,
				coordinates: { latitude: 0.0005, longitude: 0 },
			}),
			_record({
				id: "distant",
				label: "Palmeiras-Barra Funda",
				kind: "station",
				minZoom: 16,
				coordinates: { latitude: 0.002, longitude: 0 },
			}),
		]);
		expect(output.map((landmark) => landmark.id)).toEqual(["protomaps:pois:preferred", "protomaps:pois:distant"]);
		expect(output[0]?.label).toBe("Palmeiras-Barra Funda");
	});
	it("preserves nearby distinct station names even when prefixes or provider alternatives overlap", async () => {
		const records = [
			_record({ id: "luz", label: "Luz", kind: "station" }),
			_record({
				id: "prefixed",
				label: "Estação Luz",
				kind: "station",
				coordinates: { latitude: 0.0001, longitude: 0 },
			}),
			_record({
				id: "terminal",
				label: "Terminal Oeste",
				alternativeLabels: ["Luz"],
				kind: "station",
				coordinates: { latitude: 0.0002, longitude: 0 },
			}),
		];
		expect((await _landmarks(records)).map((landmark) => landmark.id)).toEqual([
			"protomaps:pois:luz",
			"protomaps:pois:prefixed",
			"protomaps:pois:terminal",
		]);
	});
	it("groups canonical Unicode and whitespace without changing the retained native label", async () => {
		const records = [
			_record({ id: "1", label: "École\t  native", minZoom: 12 }),
			_record({ id: "2", label: "E\u0301COLE native", minZoom: 13 }),
		];
		const current = _service(records);
		const output = await current.service.findForRender(_request(_input));
		expect(output.map((landmark) => landmark.label)).toEqual(["École\t  native"]);
	});
	it.each([
		{ kind: "park", count: 1 },
		{ kind: "museum", count: 2 },
	] as const)("preserves wrapped longitude distance for $kind names", async (params) => {
		const records = [
			_record({ id: "1", label: "Native", kind: params.kind, coordinates: { latitude: 0, longitude: 179.9995 } }),
			_record({ id: "2", label: "NATIVE", kind: params.kind, coordinates: { latitude: 0, longitude: -179.9985 } }),
		];
		const output = await _service(records).service.findForRender(
			_request({
				..._input,
				center: { latitude: 0, longitude: 179.9995 },
			}),
		);
		expect(output).toHaveLength(params.count);
	});
});

describe("completed native reference catalogues", () => {
	it("reuses the exact completed catalogue and isolates both miss and hit mutations", async () => {
		const current = _service([_record({ id: "1", label: "Native reference" })]);
		const first = await current.service.findForRender(_request(_input));
		const expected = structuredClone(first);
		first[0]!.label = "Mutated miss";
		first[0]!.coordinates.latitude = 1;
		first.length = 0;
		const second = await current.service.findForRender(_request(_input));
		expect(second).toEqual(expected);
		second[0]!.coordinates.longitude = 1;
		second[0]!.rank = 96;
		expect(await current.service.findForRender(_request(_input))).toEqual(expected);
		expect(td.explain(current.query).callCount).toBe(1);
	});
	it("rejects aborted callers before returning a cached complete catalogue", async () => {
		const current = _service([_record({ id: "1" })]);
		await current.service.findForRender(_request(_input));
		await expect(
			current.service.findForRender(_request({ ..._input, signal: AbortSignal.abort() })),
		).rejects.toMatchObject({
			errorCode: "ABORTED",
		});
		expect(td.explain(current.query).callCount).toBe(1);
	});
	it("reuses empty catalogues without caching repository failures", async () => {
		const current = _service([]);
		td.when(current.query(td.matchers.anything()), { times: 1 }).thenReject(new Error("Owned repository failure"));
		await expect(current.service.findForRender(_request(_input))).rejects.toThrow("Owned repository failure");
		const completed = await current.service.findForRender(_request(_input));
		expect(completed).toEqual([]);
		expect(await current.service.findForRender(_request(_input))).toEqual(completed);
		expect(td.explain(current.query).callCount).toBe(2);
	});
	it("never caches a late completed query after caller cancellation", async () => {
		const current = _service([_record({ id: "1" })]);
		const query = Promise.withResolvers<Awaited<ReturnType<typeof current.query>>>();
		td.when(current.query(td.matchers.anything()), { times: 1 }).thenReturn(query.promise);
		const cancellation = new AbortController();
		const operation = current.service.findForRender(_request({ ..._input, signal: cancellation.signal }));
		cancellation.abort();
		query.resolve([]);
		await expect(operation).rejects.toMatchObject({ errorCode: "ABORTED" });
		await current.service.findForRender(_request(_input));
		await current.service.findForRender(_request(_input));
		expect(td.explain(current.query).callCount).toBe(2);
	});
	it("keeps simultaneous misses independent and reuses only their completed result", async () => {
		const current = _service([_record({ id: "1" })]);
		const firstQuery = Promise.withResolvers<Awaited<ReturnType<typeof current.query>>>();
		const secondQuery = Promise.withResolvers<Awaited<ReturnType<typeof current.query>>>();
		td.when(current.query(td.matchers.anything()), { times: 2 }).thenReturn(firstQuery.promise, secondQuery.promise);
		const first = current.service.findForRender(_request(_input));
		const second = current.service.findForRender(_request(_input));
		expect(td.explain(current.query).callCount).toBe(2);
		const stored = [_record({ id: "1" })];
		firstQuery.resolve(stored);
		secondQuery.resolve(stored);
		const completed = await Promise.all([first, second]);
		expect(completed[1]).toEqual(completed[0]);
		expect(await current.service.findForRender(_request(_input))).toEqual(completed[0]);
		expect(td.explain(current.query).callCount).toBe(2);
	});
	it.each([
		{ field: "latitude", input: { ..._input, center: { ..._input.center, latitude: 0.0001 } } },
		{ field: "longitude", input: { ..._input, center: { ..._input.center, longitude: 0.0001 } } },
		{ field: "zoom", input: { ..._input, zoom: 14 } },
		{ field: "width", input: { ..._input, size: { ..._input.size, width: 361 } } },
		{ field: "height", input: { ..._input, size: { ..._input.size, height: 361 } } },
	])("does not alias a changed $field with a cached camera", async (scenario) => {
		const current = _service([_record({ id: "1" })]);
		await current.service.findForRender(_request(_input));
		await current.service.findForRender(_request(scenario.input));
		await current.service.findForRender(_request(_input));
		expect(td.explain(current.query).callCount).toBe(2);
	});
	it("refreshes hits and evicts the least recently used catalogue at 64 entries", async () => {
		const current = _service([_record({ id: "1" })]);
		for (let index = 0; index < 64; index++)
			await current.service.findForRender(_request({ ..._input, center: { latitude: 0, longitude: index * 0.00001 } }));
		await current.service.findForRender(_request(_input));
		await current.service.findForRender(_request({ ..._input, center: { latitude: 0, longitude: 0.00064 } }));
		await current.service.findForRender(_request(_input));
		expect(td.explain(current.query).callCount).toBe(65);
		await current.service.findForRender(_request({ ..._input, center: { latitude: 0, longitude: 0.00001 } }));
		expect(td.explain(current.query).callCount).toBe(66);
	});
	it("evicts complete catalogues at the accounted byte limit before the entry limit", async () => {
		const current = _service([_record({ id: "1".repeat(512 * 1024), label: "Native reference" })]);
		for (let index = 0; index < 8; index++)
			await current.service.findForRender(_request({ ..._input, center: { latitude: 0, longitude: index * 0.00001 } }));
		await current.service.findForRender(_request(_input));
		expect(td.explain(current.query).callCount).toBe(9);
	});
	it("returns oversized complete catalogues unchanged without retaining them", async () => {
		const record = _record({ id: "1".repeat(4 * 1024 * 1024), label: "Native reference" });
		const current = _service([record]);
		const first = await current.service.findForRender(_request(_input));
		expect(first[0]!.id).toBe(record.id);
		expect(await current.service.findForRender(_request(_input))).toEqual(first);
		expect(td.explain(current.query).callCount).toBe(2);
	});
});

describe("provider reference label alternatives", () => {
	it("preserves Latin, Arabic, Devanagari, Tibetan and CJK names for native admission", async () => {
		const labels = ["Praça São José", "متحف", "कला", "ལྷ་ས", "東京駅"];
		const output = await _landmarks(labels.map((label, index) => _record({ id: String(index), label: label })));
		expect(output.map((landmark) => landmark.label)).toEqual(labels);
	});
	it("retains an unsupported primary name and real alternatives for native selection", async () => {
		const output = await _landmarks([_record({ id: "1", label: "😀", alternativeLabels: ["東京駅"] })]);
		expect(output[0]).toMatchObject({ label: "😀", alternativeLabels: ["東京駅"] });
	});
	it("keeps a genuine provider alternative when the primary name is absent", async () => {
		const output = await _landmarks([_record({ id: "1", label: "", alternativeLabels: ["مكتبة"] })]);
		expect(output[0]).toMatchObject({ label: "", alternativeLabels: ["مكتبة"] });
	});
	it("retains more than 64 genuine provider alternatives", async () => {
		const alternatives = Array.from({ length: 80 }, (_, index) => `Provider name ${index}`);
		const output = await _landmarks([_record({ id: "1", label: "Primary", alternativeLabels: alternatives })]);
		expect(output[0]?.label).toBe("Primary");
		expect(output[0]?.alternativeLabels).toEqual(alternatives);
	});
	it("preserves a CJK primary beyond the former native UTF-8 byte budget", async () => {
		const oversized = "界".repeat(6000);
		const output = await _landmarks([_record({ id: "1", label: oversized, alternativeLabels: ["地域の学校"] })]);
		expect(output[0]).toMatchObject({ label: oversized, alternativeLabels: ["地域の学校"] });
	});
	it("keeps large genuine names alongside more than 96 other candidates", async () => {
		const oversized = "界".repeat(6000);
		const records = [
			_record({ id: "1", label: oversized, minZoom: 0, alternativeLabels: ["😀".repeat(5000)] }),
			...Array.from({ length: 96 }, (_, index) =>
				_record({ id: String(index + 2), label: `Museum ${index}`, minZoom: 13 }),
			),
		];
		const output = await _landmarks(records);
		expect(output).toHaveLength(97);
		expect(output[0]).toMatchObject({ label: oversized, alternativeLabels: ["😀".repeat(5000)] });
		expect(output.map((landmark) => landmark.rank)).toEqual(Array.from({ length: 97 }, (_, index) => index));
	});
	it("retains complete alternatives beyond the former per-name UTF-8 boundary", async () => {
		const boundary = "😀".repeat(4096);
		const records = [
			_record({
				id: "1",
				label: boundary,
				alternativeLabels: [boundary + "a", "Real alternative"],
			}),
		];
		const output = await _landmarks(records);
		expect(output[0]).toMatchObject({ label: boundary, alternativeLabels: [boundary + "a", "Real alternative"] });
		expect(records[0]?.alternativeLabels[0]).toBe(boundary + "a");
	});

	it("preserves complete catalogues beyond the former cumulative name-byte budget", async () => {
		const name = (row: number, language: number): string =>
			`${String(row).padStart(3, "0")}-${String(language).padStart(3, "0")}-`.padEnd(16384, "a");
		const output = await _landmarks(
			Array.from({ length: 3 }, (_, index) =>
				_record({
					id: String(index + 1),
					label: name(index, 0),
					alternativeLabels: Array.from({ length: 4 }, (_, language) => name(index, language + 1)),
				}),
			),
		);
		expect(output).toHaveLength(3);
		expect(output.every((landmark) => landmark.alternativeLabels.length === 4)).toBe(true);
		expect(output[2]?.alternativeLabels[3]).toBe(name(2, 4));
	});
	it("preserves complete prepared names without a cumulative UTF-8 boundary", async () => {
		const primary = "a".repeat(16384);
		const alternative = "b".repeat(16384);
		const output = await _landmarks([_record({ id: "1", label: primary, alternativeLabels: [alternative, "c"] })]);
		expect(output[0]).toMatchObject({ label: primary, alternativeLabels: [alternative, "c"] });
	});
	it("preserves each unique alternative regardless of the cumulative UTF-8 length", async () => {
		const primary = "a".repeat(16384);
		const first = "b".repeat(16000);
		const later = "好".repeat(128);
		const output = await _landmarks([
			_record({ id: "1", label: primary, alternativeLabels: [first, "c".repeat(385), later] }),
		]);
		expect(output[0]).toMatchObject({ label: primary, alternativeLabels: [first, "c".repeat(385), later] });
	});

	it("provides sparse rural schools and worship anchors outside Brazil", async () => {
		const current = _service([
			_record({ id: "1", label: "Ejura school", kind: "school", coordinates: { latitude: 7.385, longitude: -1.356 } }),
			_record({
				id: "2",
				label: "Ejura church",
				kind: "place_of_worship",
				coordinates: { latitude: 7.386, longitude: -1.355 },
			}),
		]);
		const output = await current.service.findForRender(
			_request({ ..._input, center: { latitude: 7.385, longitude: -1.356 } }),
		);
		expect(output.map((landmark) => landmark.label)).toEqual(["Ejura school", "Ejura church"]);
	});
	it("treats an unpopulated world cell as a complete empty inventory", async () => {
		const output = await _service([]).service.findForRender(
			_request({ ..._input, center: { latitude: -17, longitude: -150 } }),
		);
		expect(output).toEqual([]);
	});
});

it("retains complete station inventories alongside other categories without a category quota", async () => {
	const stations = Array.from(
		{ length: 100 },
		(_, index): PackedLandmarkRecord =>
			_record({ id: `station-${index}`, label: `Station ${index}`, kind: "station", minZoom: 1 }),
	);
	const output = await _landmarks([...stations, _record({ id: "museum", kind: "museum" })]);
	expect(output).toHaveLength(101);
	expect(output.filter((landmark) => landmark.category === PlaceCategory.TRAIN_STATION)).toHaveLength(100);
	expect(new Set(output.map((landmark) => landmark.id))).toEqual(
		new Set([...stations.map((record) => record.id), "protomaps:pois:museum"]),
	);
	expect(output[100]?.id).toBe("protomaps:pois:museum");
});
