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

	constructor(params: { neighborhood: string }) {
		this.neighborhood = params.neighborhood;
	}
}
