import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";

export class JobLocationOutputDto {
	@Expose({ name: "street" })
	@ApiProperty({ name: "street", description: "Street address", example: "Rua das Flores, 123", required: false })
	readonly street: string | null;

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

	constructor(params: { street: string | null; neighborhood: string; city: string; state: string; country: string }) {
		this.street = params.street;
		this.neighborhood = params.neighborhood;
		this.city = params.city;
		this.state = params.state;
		this.country = params.country;
	}
}
