import { applyDecorators, HttpStatus } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiParam, ApiResponse } from "@nestjs/swagger";
import { ErrorOutputDto } from "../../../core/errors/error-output.dto";
import { JobOutputDto } from "../dto/job-output.dto";
import { UpdateJobRequestDto } from "../dto/update-job-request.dto";

export function ApiUpdateJobDocs(): MethodDecorator & ClassDecorator {
	return applyDecorators(
		ApiOperation({
			summary: "Update a job",
			description:
				"Updates the fields supplied in the request and leaves all other fields unchanged. This works for both drafts and published jobs",
		}),
		ApiParam({
			name: "job_id",
			description: "ID of the draft or published job to update.",
			type: String,
			format: "uuid",
		}),
		ApiBody({ type: UpdateJobRequestDto }),
		ApiResponse({
			status: HttpStatus.OK,
			description:
				"The job was updated. When the description changes, the title other derived info may still be refreshing.",
			type: JobOutputDto,
		}),
		ApiResponse({
			status: HttpStatus.BAD_REQUEST,
			description:
				"The request is invalid in some way, e.g. an invalid field, incomplete nested object, etc. No changes were saved.",
			type: ErrorOutputDto,
		}),
		ApiResponse({
			status: HttpStatus.NOT_FOUND,
			description: "No job exists with the supplied job_id.",
			type: ErrorOutputDto,
		}),
	);
}
