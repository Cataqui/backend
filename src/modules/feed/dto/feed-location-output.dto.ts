import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";

export class FeedLocationOutputDto {
	@Expose({ name: "neighborhood" })
	@ApiProperty({
		name: "neighborhood",
		description: "Neighborhood or district of the job",
		example: "Centro",
	})
	readonly neighborhood: string;

	@Expose({ name: "city" })
	@ApiProperty({ name: "city", description: "City name of the job", example: "São Paulo" })
	readonly city: string;

	@Expose({ name: "state" })
	@ApiProperty({ name: "state", description: "State code (2 chars) of the job", example: "SP" })
	readonly state: string;

	constructor(params: { neighborhood: string; city: string; state: string }) {
		this.neighborhood = params.neighborhood;
		this.city = params.city;
		this.state = params.state;
	}
}
