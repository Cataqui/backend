import { Expose } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";
import { IsISO31661Alpha2 } from "class-validator";

export class MapConfigRequestQueryDto {
	@Expose({ name: "region" })
	@ApiProperty({
		name: "region",
		description: "Region code (ISO 3166-1 alpha-2 country code)",
		example: "BR",
	})
	@IsISO31661Alpha2()
	readonly region!: string;
}
