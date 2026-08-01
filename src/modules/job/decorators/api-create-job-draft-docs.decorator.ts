import { applyDecorators, HttpStatus } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ErrorOutputDto } from "../../../core/errors/error-output.dto";
import { CreateJobDraftRequestDto } from "../dto/create-job-draft-request.dto";
import { JobOutputDto } from "../dto/job-output.dto";

export function ApiCreateJobDraftDocs(): MethodDecorator & ClassDecorator {
	return applyDecorators(
		ApiOperation({
			summary: "Create a job draft",
			description:
				"Creates a draft from a job description. Use the returned job_id to update and publish the job later.",
		}),
		ApiBody({
			type: CreateJobDraftRequestDto,
			description: "The job description used to start the draft.",
		}),
		ApiResponse({
			status: HttpStatus.CREATED,
			description: "Job draft created.",
			type: JobOutputDto,
		}),
		ApiResponse({
			status: HttpStatus.BAD_REQUEST,
			description: "Invalid job description.",
			type: ErrorOutputDto,
		}),
	);
}
