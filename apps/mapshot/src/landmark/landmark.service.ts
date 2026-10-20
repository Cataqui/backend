import { RenderingAbortedError } from "../errors/index";
import type { MapshotRenderInput } from "@cataqui/mapshot-workerhole";
import { PlaceCategory } from "@cataqui/places";
import { injectable } from "tsyringe";

import { MapSourceService } from "../source/map-source.service";
import type { PackedLandmarkRecord } from "./index/packed-landmark-record";
import type { LandmarkOutput } from "./schemas/landmark-output.schema";

interface _Candidate {
	record: PackedLandmarkRecord;
	label: string;
	alternativeLabels: string[];
	category: PlaceCategory;
	minZoom: number;
	distanceSquared: number;
}

@injectable()
export class LandmarkService {
	constructor(private readonly _mapSourceService: MapSourceService) {}

	private readonly _cache = new Map<string, { landmarks: LandmarkOutput[]; bytes: number }>();
	private _cacheBytes = 0;
	async findForRender(params: { input: MapshotRenderInput; signal: AbortSignal }): Promise<LandmarkOutput[]> {
		this._checkAbort(params.signal);
		const key = JSON.stringify([
			params.input.center.latitude,
			params.input.center.longitude,
			params.input.zoom,
			params.input.size.width,
			params.input.size.height,
		]);
		const cached = this._cache.get(key);
		if (cached !== undefined) {
			this._cache.delete(key);
			this._cache.set(key, cached);
			return structuredClone(cached.landmarks);
		}
		if (params.input.zoom < 11) return [];
		// Broad maps use native city/region labels; custom references are local detail.
		const world = 512 * 2 ** params.input.zoom;
		const stored = await this._mapSourceService.queryLandmarks({
			center: { latitude: params.input.center.latitude, longitude: params.input.center.longitude },
			zoom: params.input.zoom,
			size: { width: params.input.size.width, height: params.input.size.height },
			signal: params.signal,
		});
		this._checkAbort(params.signal);
		const center = this._projectCoordinates({ coordinates: params.input.center, world: world });
		const candidates: _Candidate[] = [];
		for (const record of stored) {
			const category = PlaceCategory.fromProtomaps({
				kind: record.kind,
				kindDetail: record.kindDetail,
			});
			const point = this._projectCoordinates({ coordinates: record.coordinates, world: world });
			const horizontalDistance = ((((point.x - center.x + world / 2) % world) + world) % world) - world / 2;
			const verticalDistance = point.y - center.y;
			const outsideViewport =
				Math.abs(horizontalDistance) > params.input.size.width / 2 ||
				Math.abs(verticalDistance) > params.input.size.height / 2;
			if (outsideViewport) continue;
			const candidate: _Candidate = {
				record: record,
				label: record.label,
				alternativeLabels: [...record.alternativeLabels],
				category: category,
				minZoom: record.minZoom ?? 99,
				distanceSquared: horizontalDistance * horizontalDistance + verticalDistance * verticalDistance,
			};
			candidates.push(candidate);
		}
		const distinct: _Candidate[] = [];
		const byCategory = new Map<PlaceCategory, Map<string, _Candidate[]>>();
		for (const candidate of candidates.sort(
			(left, right) =>
				left.minZoom - right.minZoom ||
				left.distanceSquared - right.distanceSquared ||
				(left.record.rank ?? Number.MAX_SAFE_INTEGER) - (right.record.rank ?? Number.MAX_SAFE_INTEGER) ||
				left.record.id.localeCompare(right.record.id),
		)) {
			const threshold = candidate.category === PlaceCategory.PARK ? 250 : 75;
			const normalized = (candidate.label || candidate.alternativeLabels[0]!)
				.normalize("NFC")
				.toLowerCase()
				.replace(/\p{Dash_Punctuation}/gu, "-")
				.replace(/\s*-\s*/gu, "-")
				.replace(/\s+/gu, " ");
			let byLabel = byCategory.get(candidate.category);
			if (byLabel === undefined) {
				byLabel = new Map<string, _Candidate[]>();
				byCategory.set(candidate.category, byLabel);
			}
			const matching = byLabel.get(normalized);
			const nearbyDuplicate =
				matching?.some((previous) => {
					const left = (previous.record.coordinates.latitude * Math.PI) / 180;
					const right = (candidate.record.coordinates.latitude * Math.PI) / 180;
					const latitude = right - left;
					const longitude =
						((candidate.record.coordinates.longitude - previous.record.coordinates.longitude) * Math.PI) / 180;
					const halfChord =
						Math.sin(latitude / 2) ** 2 + Math.cos(left) * Math.cos(right) * Math.sin(longitude / 2) ** 2;
					const distance = 6371008.8 * 2 * Math.asin(Math.min(1, Math.sqrt(halfChord)));
					return distance <= threshold;
				}) === true;
			if (nearbyDuplicate) continue;
			if (matching === undefined) byLabel.set(normalized, [candidate]);
			else matching.push(candidate);
			distinct.push(candidate);
		}

		// This stable order is a layout tie-breaker; provider display scale does not establish human familiarity.
		const landmarks = distinct.map((candidate, rank) => ({
			id: candidate.record.id,
			label: candidate.label,
			alternativeLabels: candidate.alternativeLabels,
			category: candidate.category,
			coordinates: {
				latitude: candidate.record.coordinates.latitude,
				longitude: candidate.record.coordinates.longitude,
			},
			rank: rank,
			sourceMinZoom: candidate.record.minZoom,
		}));
		this._checkAbort(params.signal);
		// Conservative UTF-16/string and object accounting bounds retained entries, not transient caller allocations.
		const bytes = key.length * 2 + JSON.stringify(landmarks).length * 2 + landmarks.length * 512 + 1024;
		if (bytes > 8 * 1024 * 1024) return landmarks;
		// Concurrent misses remain independent; their completed entries replace the same key without double-accounting.
		const previous = this._cache.get(key);
		if (previous !== undefined) {
			this._cacheBytes -= previous.bytes;
			this._cache.delete(key);
		}
		while (this._cache.size >= 64 || this._cacheBytes + bytes > 8 * 1024 * 1024) {
			// An admitted incoming entry fits alone, so an over-budget cache always has an oldest entry.
			const oldest = this._cache.entries().next().value!;
			this._cacheBytes -= oldest[1].bytes;
			this._cache.delete(oldest[0]);
		}
		this._cache.set(key, { landmarks: structuredClone(landmarks), bytes: bytes });
		this._cacheBytes += bytes;
		return landmarks;
	}

	private _projectCoordinates(params: { coordinates: { latitude: number; longitude: number }; world: number }): {
		x: number;
		y: number;
	} {
		return {
			x: ((params.coordinates.longitude + 180) / 360) * params.world,
			y: ((1 - Math.asinh(Math.tan((params.coordinates.latitude * Math.PI) / 180)) / Math.PI) / 2) * params.world,
		};
	}

	private _checkAbort(signal: AbortSignal): void {
		if (signal.aborted) throw new RenderingAbortedError();
	}
}
