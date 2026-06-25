import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import { JobContactMethod } from "../../../../generated/prisma/client.js";

export class JobContactOutputDto {
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
		enum: JobContactMethod,
		description: "Preferred contact method",
		example: JobContactMethod.WHATSAPP,
	})
	readonly method: JobContactMethod;

	constructor(params: { contactPhoneNumber: string; contactMethod: JobContactMethod }) {
		this.phoneNumber = params.contactPhoneNumber;
		this.method = params.contactMethod;
	}
}
