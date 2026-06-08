import { LocationConstants } from "./location.constants";
import type { ILocationCoordinate } from "./location-coordinate.interface";

function calculateDistanceMeters(start: ILocationCoordinate, end: ILocationCoordinate): number {
	const startLatitude = _degreesToRadians(start.latitude);
	const endLatitude = _degreesToRadians(end.latitude);
	const latitudeDelta = _degreesToRadians(end.latitude - start.latitude);
	const longitudeDelta = _degreesToRadians(end.longitude - start.longitude);

	const haversine =
		Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2) + Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) * Math.sin(longitudeDelta / 2);

	return LocationConstants.EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function fuzzLocationCoordinate(
	params: ILocationCoordinate & {
		minDistanceMeters: number;
		maxDistanceMeters: number;
		random?: (() => number) | undefined;
	},
): ILocationCoordinate {
	const random = params.random ?? Math.random;
	const distanceMeters = params.minDistanceMeters + random() * (params.maxDistanceMeters - params.minDistanceMeters);
	const bearingRadians = random() * LocationConstants.FULL_CIRCLE_RADIANS;

	return _calculateOffsetCoordinate({
		latitude: params.latitude,
		longitude: params.longitude,
		distanceMeters,
		bearingRadians,
	});
}

function _degreesToRadians(degrees: number): number {
	return (degrees * Math.PI) / 180;
}

function _radiansToDegrees(radians: number): number {
	return (radians * 180) / Math.PI;
}

function _calculateOffsetCoordinate(params: ILocationCoordinate & { distanceMeters: number; bearingRadians: number }): ILocationCoordinate {
	const latitudeRadians = _degreesToRadians(params.latitude);
	const longitudeRadians = _degreesToRadians(params.longitude);
	const angularDistance = params.distanceMeters / LocationConstants.EARTH_RADIUS_METERS;

	const fuzzyLatitudeRadians = Math.asin(
		Math.sin(latitudeRadians) * Math.cos(angularDistance) + Math.cos(latitudeRadians) * Math.sin(angularDistance) * Math.cos(params.bearingRadians),
	);

	const fuzzyLongitudeRadians =
		longitudeRadians +
		Math.atan2(
			Math.sin(params.bearingRadians) * Math.sin(angularDistance) * Math.cos(latitudeRadians),
			Math.cos(angularDistance) - Math.sin(latitudeRadians) * Math.sin(fuzzyLatitudeRadians),
		);

	return {
		latitude: Number(_radiansToDegrees(fuzzyLatitudeRadians).toFixed(6)),
		longitude: Number(_radiansToDegrees(fuzzyLongitudeRadians).toFixed(6)),
	};
}

export const LocationUtils = {
	fuzzLocationCoordinate,
	calculateDistanceMeters,
} as const;
