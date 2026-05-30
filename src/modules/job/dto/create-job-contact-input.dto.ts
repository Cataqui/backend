import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import { IsString, IsEnum, Length, IsPhoneNumber } from "class-validator";
import { ContactMethod } from "../../../../generated/prisma/client.js";

export class CreateJobContactInputDto {
	@Expose({ name: "name" })
	@ApiProperty({ name: "name", description: "Contact person's name", example: "João Silva" })
	@IsString()
	@Length(2, 100)
	readonly name!: string;

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
		enum: ContactMethod,
		description: "Preferred contact method",
		example: ContactMethod.WHATSAPP,
	})
	@IsEnum(ContactMethod)
	readonly method!: ContactMethod;
}
