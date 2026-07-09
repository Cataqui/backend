import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import { IsPhoneNumber } from "class-validator";
import type { IJobContactDetails } from "../../interfaces/job-contact-details.interface";

export class PhoneCallContactDetailsInputDto implements IJobContactDetails {
	@Expose({ name: "phone_number" })
	@ApiProperty({
		name: "phone_number",
		description: "Phone number with country code for phone call",
		example: "+5511999999999",
	})
	@IsPhoneNumber()
	readonly phoneNumber!: string;

	getIdentifier(): string {
		return this.phoneNumber;
	}
}
