import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import { IsString, IsOptional, Length, IsISO31661Alpha2 } from "class-validator";

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
}
