import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import { JobLocationConstants } from "../job-location.constants";

export class JobLocationOutputDto {
	@Expose({ name: "neighborhood" })
	@ApiProperty({
		name: "neighborhood",
		description: "Neighborhood or district",
		example: "Centro",
	})
	readonly neighborhood: string;

	@Expose({ name: "city" })
	@ApiProperty({ name: "city", description: "City name", example: "São Paulo" })
	readonly city: string;

	@Expose({ name: "state" })
	@ApiProperty({ name: "state", description: "State code (2 chars)", example: "SP" })
	readonly state: string;

	@Expose({ name: "country" })
	@ApiProperty({ name: "country", description: "Country code (ISO 3166-1 alpha-2)", example: "BR" })
	readonly country: string;

	@Expose({ name: "latitude" })
	@ApiProperty({
		name: "latitude",
		description: "Fuzzy public latitude of the location to show on map. Note that this is not the exact location but an estimation",
		example: -23.547812,
	})
	readonly latitude: number;

	@Expose({ name: "longitude" })
	@ApiProperty({
		name: "longitude",
		description: "Fuzzy public longitude of the location to show on map. Note that this is not the exact location but an estimation",
		example: -46.630431,
	})
	readonly longitude: number;

	@Expose({ name: "area_radius" })
	@ApiProperty({ name: "area_radius", description: "Radius in meters clients should draw around the fuzzy location", example: JobLocationConstants.AREA_RADIUS_METERS })
	readonly areaRadius: number;

	constructor(params: {
		neighborhood: string;
		city: string;
		state: string;
		country: string;
		latitude: { toNumber(): number } | number;
		longitude: { toNumber(): number } | number;
		areaRadius?: number | undefined;
	}) {
		this.neighborhood = params.neighborhood;
		this.city = params.city;
		this.state = params.state;
		this.country = params.country;
		this.latitude = this._toNumber(params.latitude);
		this.longitude = this._toNumber(params.longitude);
		this.areaRadius = params.areaRadius ?? JobLocationConstants.AREA_RADIUS_METERS;
	}

	private _toNumber(value: { toNumber(): number } | number): number {
		return typeof value === "number" ? value : value.toNumber();
	}
}
