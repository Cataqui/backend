import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { MapConfigRequestQueryDto } from "./map-config-request-query.dto";

describe("MapConfigRequestQueryDto", () => {
	it("should validate a valid region code", async () => {
		const dto = plainToInstance(MapConfigRequestQueryDto, { region: "BR" });
		const errors = await validate(dto);

		expect(errors).toHaveLength(0);
	});

	it("should validate another valid region code", async () => {
		const dto = plainToInstance(MapConfigRequestQueryDto, { region: "US" });
		const errors = await validate(dto);

		expect(errors).toHaveLength(0);
	});

	it("should reject an empty region", async () => {
		const dto = plainToInstance(MapConfigRequestQueryDto, { region: "" });
		const errors = await validate(dto);

		expect(errors.length).toBeGreaterThan(0);
	});

	it("should reject a region with numbers", async () => {
		const dto = plainToInstance(MapConfigRequestQueryDto, { region: "12" });
		const errors = await validate(dto);

		expect(errors.length).toBeGreaterThan(0);
	});

	it("should accept a lowercase region", async () => {
		const dto = plainToInstance(MapConfigRequestQueryDto, { region: "br" });
		const errors = await validate(dto);

		expect(errors).toHaveLength(0);
	});

	it("should reject a single character region", async () => {
		const dto = plainToInstance(MapConfigRequestQueryDto, { region: "B" });
		const errors = await validate(dto);

		expect(errors.length).toBeGreaterThan(0);
	});

	it("should reject a region with more than 2 characters", async () => {
		const dto = plainToInstance(MapConfigRequestQueryDto, { region: "BRA" });
		const errors = await validate(dto);

		expect(errors.length).toBeGreaterThan(0);
	});
});
