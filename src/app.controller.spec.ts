import { Test } from "@nestjs/testing";
import { AppController } from "./app.controller";

describe("AppController", () => {
	let controller: AppController;

	beforeEach(async () => {
		const module = await Test.createTestingModule({
			controllers: [AppController],
		}).compile();

		controller = module.get(AppController);
	});

	it("should return ok status", () => {
		const result = controller.root();

		expect(result.status).toBe("ok");
	});

	it("should return a running message", () => {
		const result = controller.root();

		expect(result.message).toBe("Cataquí API server is running...");
	});

	it("should return the current environment", () => {
		process.env["NODE_ENV"] = "test";

		const result = controller.root();

		expect(result.environment).toBe("test");
	});

	it("should always return a non-empty environment string", () => {
		const result = controller.root();

		expect(result.environment).toBeTruthy();
		expect(typeof result.environment).toBe("string");
	});
});
