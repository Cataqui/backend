import { Injectable } from "@nestjs/common";
import type { ILocationCoordinate } from "./interfaces/location-coordinate.interface";

@Injectable()
export class LocationService {
	fuzzCoordinate(
		params: ILocationCoordinate & {
			minDistanceMeters: number;
			maxDistanceMeters: number;
			random?: (() => number) | undefined;
		},
	): ILocationCoordinate {
		const random = params.random ?? Math.random;
		const distanceMeters = params.minDistanceMeters + random() * (params.maxDistanceMeters - params.minDistanceMeters);
		const bearingRadians = random() * (Math.PI * 2);
		const latitudeRadians = (params.latitude * Math.PI) / 180;
		const longitudeRadians = (params.longitude * Math.PI) / 180;
		const angularDistance = distanceMeters / 6_371_000;

		const fuzzyLatitudeRadians = Math.asin(
			Math.sin(latitudeRadians) * Math.cos(angularDistance) +
				Math.cos(latitudeRadians) * Math.sin(angularDistance) * Math.cos(bearingRadians),
		);
		const fuzzyLongitudeRadians =
			longitudeRadians +
			Math.atan2(
				Math.sin(bearingRadians) * Math.sin(angularDistance) * Math.cos(latitudeRadians),
				Math.cos(angularDistance) - Math.sin(latitudeRadians) * Math.sin(fuzzyLatitudeRadians),
			);
		const fuzzyLongitude = Number(((fuzzyLongitudeRadians * 180) / Math.PI).toFixed(6));

		return {
			latitude: Number(((fuzzyLatitudeRadians * 180) / Math.PI).toFixed(6)),
			longitude:
				fuzzyLongitude < -180 || fuzzyLongitude > 180
					? Number((((fuzzyLongitude + 540) % 360) - 180).toFixed(6))
					: fuzzyLongitude,
		};
	}
}
