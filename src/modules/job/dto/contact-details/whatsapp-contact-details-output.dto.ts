import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import type { IJobContactDetails } from "../../interfaces/job-contact-details.interface";

export class WhatsappContactDetailsOutputDto implements IJobContactDetails {
	constructor(params: { phoneNumber: string }) {
		this.phoneNumber = params.phoneNumber;
	}

	@Expose({ name: "phone_number" })
	@ApiProperty({
		name: "phone_number",
		description: "Phone number with country code for WhatsApp",
		example: "+5511999999999",
	})
	readonly phoneNumber: string;

	getIdentifier(): string {
		return this.phoneNumber;
	}
}
