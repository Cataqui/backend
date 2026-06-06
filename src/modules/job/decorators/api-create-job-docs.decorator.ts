import { HttpStatus, applyDecorators } from "@nestjs/common";
import { ApiOperation, ApiBody, ApiResponse } from "@nestjs/swagger";
import { CreateJobRequestDto } from "../dto/create-job-request.dto";
import { JobOutputDto } from "../dto/job-output.dto";

export function ApiCreateJobDocs(): MethodDecorator & ClassDecorator {
	return applyDecorators(
		ApiOperation({ summary: "Create a new job listing" }),
		ApiBody({ type: CreateJobRequestDto }),
		ApiResponse({
			status: HttpStatus.CREATED,
			description: "Job created successfully",
			type: JobOutputDto,
		}),
		ApiResponse({
			status: HttpStatus.BAD_REQUEST,
			description: "Invalid input, invalid job payment rules, or category_id does not match an existing category",
		}),
	);
}
