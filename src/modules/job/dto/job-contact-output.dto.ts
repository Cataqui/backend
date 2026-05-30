import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import { ContactMethod } from "../../../../generated/prisma/client.js";

export class JobContactOutputDto {
	@Expose({ name: "name" })
	@ApiProperty({ name: "name", description: "Contact person's name", example: "João Silva" })
	readonly name: string;

	@Expose({ name: "phone_number" })
	@ApiProperty({
		name: "phone_number",
		description: "Phone number with country code",
		example: "+5511999999999",
	})
	readonly phoneNumber: string;

	@Expose({ name: "contact_method" })
	@ApiProperty({
		name: "contact_method",
		enum: ContactMethod,
		description: "Preferred contact method",
		example: ContactMethod.WHATSAPP,
	})
	readonly method: ContactMethod;

	constructor(params: { contactName: string; contactPhoneNumber: string; contactMethod: ContactMethod }) {
		this.name = params.contactName;
		this.phoneNumber = params.contactPhoneNumber;
		this.method = params.contactMethod;
	}
}
