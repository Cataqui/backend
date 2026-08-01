import { applyDecorators, HttpStatus } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiResponse } from "@nestjs/swagger";
import { ErrorOutputDto } from "../../../core/errors/error-output.dto";
import { JobOutputDto } from "../dto/job-output.dto";

export function ApiPublishJobDocs(): MethodDecorator & ClassDecorator {
	return applyDecorators(
		ApiOperation({
			summary: "Publish a job",
			description:
				"Publishes a completed draft and makes it available in the job feed. Before publishing, use `PATCH /v1/job/{job_id}` to add any fields that are missing or you want to change. \n\n" +
				"If the draft is incomplete, it remains a draft. Once the job has been published, this endpoint cannot publish it again.",
		}),
		ApiParam({
			name: "job_id",
			description: "ID of the draft to publish.",
			type: String,
			format: "uuid",
		}),
		ApiResponse({
			status: HttpStatus.OK,
			description: "The job was published and returned.",
			type: JobOutputDto,
		}),
		ApiResponse({
			status: HttpStatus.BAD_REQUEST,
			description:
				"The draft is missing one or more required fields. The error message lists the fields to add before trying again.",
			type: ErrorOutputDto,
		}),
		ApiResponse({
			status: HttpStatus.NOT_FOUND,
			description: "No job exists with the supplied job_id.",
			type: ErrorOutputDto,
		}),
		ApiResponse({
			status: HttpStatus.CONFLICT,
			description: "The job has already been published.",
			type: ErrorOutputDto,
		}),
		ApiResponse({
			status: HttpStatus.SERVICE_UNAVAILABLE,
			description:
				"We could not derive important data from the description. The job remains a draft; try publishing it again.",
			type: ErrorOutputDto,
		}),
	);
}
