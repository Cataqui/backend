import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import { JobContactMethod } from "../../../../generated/prisma/client.js";

export class JobContactReferenceOutputDto {
	static fromDatabase(contact: { id: string; contactMethod: JobContactMethod }): JobContactReferenceOutputDto {
		return new JobContactReferenceOutputDto({
			contactId: contact.id,
			contactMethod: contact.contactMethod,
		});
	}

	@Expose({ name: "contact_id" })
	@ApiProperty({
		name: "contact_id",
		description: "Id of the job contact to fetch full details from",
		example: "cm3x-contact-1",
	})
	readonly contactId: string;

	@Expose({ name: "contact_method" })
	@ApiProperty({
		name: "contact_method",
		enum: JobContactMethod,
		description: "Preferred contact method",
		example: JobContactMethod.WHATSAPP,
	})
	readonly contactMethod: JobContactMethod;

	constructor(params: { contactId: string; contactMethod: JobContactMethod }) {
		this.contactId = params.contactId;
		this.contactMethod = params.contactMethod;
	}
}
