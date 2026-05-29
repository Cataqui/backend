import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";

export class JobContactOutputDto {
	@Expose({ name: "name" })
	@ApiProperty({ name: "name", description: "Contact person's name", example: "João Silva" })
	readonly name: string;

	@Expose({ name: "whatsapp_number" })
	@ApiProperty({
		name: "whatsapp_number",
		description: "WhatsApp number with country code",
		example: "+5511999999999",
	})
	readonly whatsappNumber: string;

	@Expose({ name: "whatsapp_url" })
	@ApiProperty({
		name: "whatsapp_url",
		description: "WhatsApp deep link URL",
		example: "https://wa.me/5511999999999",
	})
	readonly whatsappUrl: string;

	constructor(params: { contactName: string; contactWhatsapp: string }) {
		this.name = params.contactName;
		this.whatsappNumber = params.contactWhatsapp;
		this.whatsappUrl = `https://wa.me/${params.contactWhatsapp.replace("+", "")}`;
	}
}
