import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import { IsUUID } from "class-validator";

export class GetJobContactRequestParamsDto {
	@Expose({ name: "job_id" })
	@ApiProperty({
		name: "job_id",
		description: "Id of the job that owns the contact.",
		example: "afdfd9b2-203d-4528-8a1c-82b6b139039b",
	})
	@IsUUID()
	readonly jobId!: string;

	@Expose({ name: "contact_id" })
	@ApiProperty({
		name: "contact_id",
		description: "Id of the contact to fetch.",
		example: "afdfd9b2-203d-4528-8a1c-82b6b139039b",
	})
	@IsUUID()
	readonly contactId!: string;
}
