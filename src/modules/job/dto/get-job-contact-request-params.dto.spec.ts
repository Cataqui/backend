import { validate } from "class-validator";
import { GetJobContactRequestParamsDto } from "./get-job-contact-request-params.dto";

describe("GetJobContactRequestParamsDto", () => {
	function createDto(overrides: Partial<GetJobContactRequestParamsDto> = {}): GetJobContactRequestParamsDto {
		const defaults: Partial<GetJobContactRequestParamsDto> = {
			jobId: "afdfd9b2-203d-4528-8a1c-82b6b139039b",
			contactId: "b1c2d3e4-5678-4abc-8def-1234567890ab",
		};
		return Object.assign(new GetJobContactRequestParamsDto(), defaults, overrides);
	}

	describe("jobId validation", () => {
		it("should accept a valid UUID", async () => {
			const dto = createDto();

			const errors = await validate(dto);

			expect(errors).toHaveLength(0);
		});

		it("should reject a non-UUID string for jobId", async () => {
			const dto = createDto({ jobId: "not-a-uuid" });

			const errors = await validate(dto);

			expect(errors).toHaveLength(1);
			expect(errors[0]?.property).toBe("jobId");
		});

		it("should reject an empty jobId", async () => {
			const dto = createDto({ jobId: "" });

			const errors = await validate(dto);

			expect(errors).toHaveLength(1);
			expect(errors[0]?.property).toBe("jobId");
		});
	});

	describe("contactId validation", () => {
		it("should accept a valid UUID", async () => {
			const dto = createDto();

			const errors = await validate(dto);

			expect(errors).toHaveLength(0);
		});

		it("should reject a non-UUID string for contactId", async () => {
			const dto = createDto({ contactId: "not-a-uuid" });

			const errors = await validate(dto);

			expect(errors).toHaveLength(1);
			expect(errors[0]?.property).toBe("contactId");
		});

		it("should reject an empty contactId", async () => {
			const dto = createDto({ contactId: "" });

			const errors = await validate(dto);

			expect(errors).toHaveLength(1);
			expect(errors[0]?.property).toBe("contactId");
		});
	});
});
