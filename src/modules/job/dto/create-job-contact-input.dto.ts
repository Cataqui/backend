import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import {
	IsEnum,
	IsOptional,
	IsPhoneNumber,
	IsString,
	Length,
} from "class-validator";
import { JobContactMethod } from "../../../../generated/prisma/client.js";

export class CreateJobContactInputDto {
	@Expose({ name: "name" })
	@ApiProperty({
		name: "name",
		description: "Opitionally pass the name of the person to contact.",
		example: "João Silva",
		required: false,
		nullable: true,
	})
	@IsOptional()
	@IsString()
	@Length(2, 100)
	readonly name: string | null | undefined;

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
