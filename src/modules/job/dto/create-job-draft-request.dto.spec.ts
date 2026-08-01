import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateJobDraftRequestDto } from "./create-job-draft-request.dto";

describe("CreateJobDraftRequestDto", () => {
	it("should accept descriptions at the minimum supported length", async () => {
		const dto = plainToInstance(CreateJobDraftRequestDto, { description: "1234567890" });

		expect(await validate(dto)).toHaveLength(0);
	});

	it("should reject descriptions shorter than ten characters", async () => {
		const dto = plainToInstance(CreateJobDraftRequestDto, { description: "short" });

		expect(await validate(dto)).not.toHaveLength(0);
	});

	it("should reject descriptions longer than ten thousand characters", async () => {
		const dto = plainToInstance(CreateJobDraftRequestDto, { description: "a".repeat(10_001) });

		expect(await validate(dto)).not.toHaveLength(0);
	});
});
