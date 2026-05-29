import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import { IsString, Length, IsPhoneNumber } from "class-validator";

export class CreateJobContactInputDto {
	@Expose({ name: "name" })
	@ApiProperty({ name: "name", description: "Contact person's name", example: "João Silva" })
	@IsString()
	@Length(2, 100)
	readonly name!: string;

	@Expose({ name: "whatsapp_number" })
	@ApiProperty({
		name: "whatsapp_number",
		description: "WhatsApp number with country code",
		example: "+5511999999999",
	})
	@IsPhoneNumber()
	readonly whatsappNumber!: string;
}
