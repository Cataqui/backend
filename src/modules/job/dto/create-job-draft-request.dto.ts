import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import { IsString, Length } from "class-validator";

export class CreateJobDraftRequestDto {
	@Expose({ name: "description" })
	@ApiProperty({
		name: "description",
		description: "The job description used to create the draft.",
		example:
			"Preciso de duas pessoas para descarregar um caminhão neste sábado por três horas. Pago no mesmo dia e forneço luvas e carrinho.",
		minLength: 10,
		maxLength: 10_000,
	})
	@IsString({
		message: "description must be a string containing the original job text. Example: Vaga de auxiliar de cozinha.",
	})
	@Length(10, 10_000, {
		message: "description must contain between 10 and 10000 characters. Example: Vaga de auxiliar de cozinha.",
	})
	readonly description!: string;
}
