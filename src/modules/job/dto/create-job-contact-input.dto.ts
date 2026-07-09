import { ApiProperty } from "@nestjs/swagger";
import { Expose, Transform } from "class-transformer";
import { IsEnum, IsNotEmptyObject, ValidateNested } from "class-validator";
import { JobContactMethod } from "../../../../generated/prisma/client.js";
import type { ContactDetailsInputDto } from "../types/job-contact.types";
import { JobContactUtils } from "../utils/job-contact.utils";

export class CreateJobContactInputDto {
	@Expose({ name: "contact_method" })
	@ApiProperty({
		name: "contact_method",
		enum: JobContactMethod,
		description: "Preferred contact method",
		example: JobContactMethod.WHATSAPP,
	})
	@IsEnum(JobContactMethod)
	readonly contactMethod!: JobContactMethod;

	@Expose({ name: "contact_details" })
	@ApiProperty({
		name: "contact_details",
		description: "Method-specific contact details. Shape depends on contact_method",
	})
	@IsNotEmptyObject()
	@Transform(({ obj }: { obj: Record<string, unknown> }) => JobContactUtils.instantiateDetailsInput(obj))
	@ValidateNested()
	readonly contactDetails!: ContactDetailsInputDto;
}
