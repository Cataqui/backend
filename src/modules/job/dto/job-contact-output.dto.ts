import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import { JobContactMethod } from "../../../../generated/prisma/client.js";

export class JobContactOutputDto {
	static fromDatabase(contact: { contactMethod: JobContactMethod; identifier: string }): JobContactOutputDto {
		return new JobContactOutputDto({
			contactMethod: contact.contactMethod,
			identifier: contact.identifier,
		});
	}

	@Expose({ name: "contact_method" })
	@ApiProperty({
		name: "contact_method",
		enum: JobContactMethod,
		description: "Preferred contact method",
		example: JobContactMethod.WHATSAPP,
	})
	readonly contactMethod: JobContactMethod;

	@Expose({ name: "identifier" })
	@ApiProperty({
		name: "identifier",
		description:
			"Contact identifier such as phone number with country code, email address, etc. Vary depending on the contact method.",
		example: "+5511999999999",
	})
	readonly identifier: string;

	constructor(params: { contactMethod: JobContactMethod; identifier: string }) {
		this.contactMethod = params.contactMethod;
		this.identifier = params.identifier;
	}
}
