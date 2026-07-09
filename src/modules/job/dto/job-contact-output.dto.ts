import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import { JobContactMethod } from "../../../../generated/prisma/client.js";
import type { ContactDetailsOutputDto } from "../types/job-contact.types";
import { JobContactUtils } from "../utils/job-contact.utils";

export class JobContactOutputDto {
	static fromDatabase(contact: { contactMethod: JobContactMethod; identifier: string }): JobContactOutputDto {
		return new JobContactOutputDto({
			contactMethod: contact.contactMethod,
			contactDetails: JobContactUtils.buildDetailsOutputDto(contact.contactMethod, contact.identifier),
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

	@Expose({ name: "contact_details" })
	@ApiProperty({
		name: "contact_details",
		description: "Method-specific contact details. Shape depends on contact_method",
	})
	readonly contactDetails: ContactDetailsOutputDto;

	constructor(params: { contactMethod: JobContactMethod; contactDetails: ContactDetailsOutputDto }) {
		this.contactMethod = params.contactMethod;
		this.contactDetails = params.contactDetails;
	}
}
