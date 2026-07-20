import { applyDecorators, HttpStatus } from "@nestjs/common";
import { ApiOperation, ApiResponse } from "@nestjs/swagger";
import { JobContactOutputDto } from "../dto/job-contact-output.dto";

export function ApiGetJobContactDocs(): MethodDecorator & ClassDecorator {
	return applyDecorators(
		ApiOperation({ summary: "Get full contact details for a job contact by id" }),
		ApiResponse({
			status: HttpStatus.OK,
			description: "Contact found",
			type: JobContactOutputDto,
		}),
		ApiResponse({
			status: HttpStatus.NOT_FOUND,
			description: "Job contact not found",
		}),
	);
}
