import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import { IsEnum, IsPhoneNumber } from "class-validator";
import { JobContactMethod } from "../../../../generated/prisma/client.js";

export class CreateJobContactInputDto {
	@Expose({ name: "phone_number" })
	@ApiProperty({
		name: "phone_number",
		description: "Phone number with country code",
		example: "+5511999999999",
	})
	@IsPhoneNumber()
	readonly phoneNumber!: string;

	@Expose({ name: "contact_method" })
	@ApiProperty({
		name: "contact_method",
		enum: JobContactMethod,
		description: "Preferred contact method",
		example: JobContactMethod.WHATSAPP,
	})
	@IsEnum(JobContactMethod)
	readonly method!: JobContactMethod;
}
