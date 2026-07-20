import { applyDecorators, HttpStatus } from "@nestjs/common";
import { ApiOperation, ApiResponse } from "@nestjs/swagger";
import { JobOutputDto } from "../dto/job-output.dto";

export function ApiGetJobDocs(): MethodDecorator & ClassDecorator {
	return applyDecorators(
		ApiOperation({ summary: "Get a job by ID" }),
		ApiResponse({
			status: HttpStatus.OK,
			description: "Job found",
			type: JobOutputDto,
		}),
		ApiResponse({
			status: HttpStatus.NOT_FOUND,
			description: "Job not found",
		}),
	);
}
