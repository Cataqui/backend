import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";

export class JobCategoryOutputDto {
	@Expose({ name: "category_id" })
	@ApiProperty({ name: "category_id", description: "Job category unique identifier", example: "cm3x..." })
	readonly categoryId: string;

	@Expose({ name: "name" })
	@ApiProperty({ name: "name", description: "Category display name", example: "Moving Help" })
	readonly name: string;

	@Expose({ name: "slug" })
	@ApiProperty({ name: "slug", description: "Category URL-friendly slug", example: "moving-help" })
	readonly slug: string;

	constructor(params: { categoryId: string; name: string; slug: string }) {
		this.categoryId = params.categoryId;
		this.name = params.name;
		this.slug = params.slug;
	}
}
