import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { MapAuthenticateRequestDto } from "./map-authenticate-request.dto";

describe("MapAuthenticateRequestDto", () => {
	it("should validate a valid region code", async () => {
		const dto = plainToInstance(MapAuthenticateRequestDto, { region: "BR" });
		const errors = await validate(dto);

		expect(errors).toHaveLength(0);
	});

	it("should validate another valid region code", async () => {
		const dto = plainToInstance(MapAuthenticateRequestDto, { region: "US" });
		const errors = await validate(dto);

		expect(errors).toHaveLength(0);
	});

	it("should reject an empty region", async () => {
		const dto = plainToInstance(MapAuthenticateRequestDto, { region: "" });
		const errors = await validate(dto);

		expect(errors.length).toBeGreaterThan(0);
	});

	it("should reject a region with numbers", async () => {
		const dto = plainToInstance(MapAuthenticateRequestDto, { region: "12" });
		const errors = await validate(dto);

		expect(errors.length).toBeGreaterThan(0);
	});

	it("should accept a lowercase region", async () => {
		const dto = plainToInstance(MapAuthenticateRequestDto, { region: "br" });
		const errors = await validate(dto);

		expect(errors).toHaveLength(0);
	});

	it("should reject a single character region", async () => {
		const dto = plainToInstance(MapAuthenticateRequestDto, { region: "B" });
		const errors = await validate(dto);

		expect(errors.length).toBeGreaterThan(0);
	});

	it("should reject a region with more than 2 characters", async () => {
		const dto = plainToInstance(MapAuthenticateRequestDto, { region: "BRA" });
		const errors = await validate(dto);

		expect(errors.length).toBeGreaterThan(0);
	});
});
