import { validate } from "class-validator";
import { GetJobRequestParamsDto } from "./get-job-request-params.dto";

describe("GetJobRequestParamsDto", () => {
	describe("jobId validation", () => {
		function createDto(overrides: Partial<GetJobRequestParamsDto> = {}): GetJobRequestParamsDto {
			const defaults: Partial<GetJobRequestParamsDto> = { jobId: "afdfd9b2-203d-4528-8a1c-82b6b139039b" };
			return Object.assign(new GetJobRequestParamsDto(), defaults, overrides);
		}

		it("should accept a valid UUID", async () => {
			const dto = createDto();

			const errors = await validate(dto);

			expect(errors).toHaveLength(0);
		});

		it("should reject a non-UUID string", async () => {
			const dto = createDto({ jobId: "not-a-uuid" });

			const errors = await validate(dto);

			expect(errors).toHaveLength(1);
			expect(errors[0]?.property).toBe("jobId");
		});

		it("should reject an empty string", async () => {
			const dto = createDto({ jobId: "" });

			const errors = await validate(dto);

			expect(errors).toHaveLength(1);
			expect(errors[0]?.property).toBe("jobId");
		});
	});
});
