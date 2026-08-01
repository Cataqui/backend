import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { JobType } from "../../../../generated/prisma/client.js";
import { UpdateJobRequestDto } from "./update-job-request.dto";

describe("UpdateJobRequestDto", () => {
	it("should accept one customer-editable field for a partial edit", async () => {
		const dto = plainToInstance(UpdateJobRequestDto, { description: "Nova descrição da oportunidade." });

		expect(await validate(dto)).toHaveLength(0);
	});

	it("should reject a customer-supplied derived title", async () => {
		const dto = plainToInstance(UpdateJobRequestDto, { title: "Título manual" });

		expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).not.toHaveLength(0);
	});

	it("should accept an empty no-op patch", async () => {
		const dto = plainToInstance(UpdateJobRequestDto, {});

		expect(await validate(dto)).toHaveLength(0);
	});

	it("should reject an invalid supplied field without requiring unrelated fields", async () => {
		const dto = plainToInstance(UpdateJobRequestDto, { type: "UNKNOWN" });

		expect(await validate(dto)).not.toHaveLength(0);
	});

	it("should accept a valid supplied job type without requiring unrelated fields", async () => {
		const dto = plainToInstance(UpdateJobRequestDto, { type: JobType.CONTRACTOR });

		expect(await validate(dto)).toHaveLength(0);
	});
});
