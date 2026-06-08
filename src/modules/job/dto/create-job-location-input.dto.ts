import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import { IsString, IsOptional, Length, IsISO31661Alpha2, IsLatitude, IsLongitude } from "class-validator";

export class CreateJobLocationInputDto {
	@Expose({ name: "street" })
	@ApiProperty({ name: "street", description: "Street address", example: "Rua das Flores, 123", required: false })
	@IsOptional()
	@IsString()
	@Length(0, 200)
	readonly street: string | undefined;

	@Expose({ name: "neighborhood" })
	@ApiProperty({ name: "neighborhood", description: "Neighborhood or district", example: "Centro" })
	@IsString()
	@Length(2, 100)
	readonly neighborhood!: string;

	@Expose({ name: "city" })
	@ApiProperty({ name: "city", description: "City name", example: "São Paulo" })
	@IsString()
	@Length(2, 100)
	readonly city!: string;

	@Expose({ name: "state" })
	@ApiProperty({ name: "state", description: "State code (2 chars)", example: "SP" })
	@IsString()
	@Length(2, 2)
	readonly state!: string;

	@Expose({ name: "country" })
	@ApiProperty({ name: "country", description: "Country code (ISO 3166-1 alpha-2)", example: "BR" })
	@IsISO31661Alpha2()
	readonly country!: string;

	@Expose({ name: "latitude" })
	@ApiProperty({
		name: "latitude",
		description: "Real latitude of the location or neighborhood's latitude if real location is unknown",
		example: -23.55052,
		minimum: -90,
		maximum: 90,
	})
	@IsLatitude()
	readonly latitude!: number;

	@Expose({ name: "longitude" })
	@ApiProperty({
		name: "longitude",
		description: "Real longitude of the location or neighborhood's longitude if real location is unknown",
		example: -46.633308,
		minimum: -180,
		maximum: 180,
	})
	@IsLongitude()
	readonly longitude!: number;
}
