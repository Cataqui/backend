import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import { IsEnum, IsString } from "class-validator";
import { JobContactMethod } from "../../../../generated/prisma/client.js";

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

	@Expose({ name: "identifier" })
	@ApiProperty({
		name: "identifier",
		description:
			"Contact identifier such as phone number with country code, email address, etc. Vary depending on the contact method.",
		example: "+5511999999999",
	})
	@IsString()
	readonly identifier!: string;
}
