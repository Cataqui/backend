import { DECORATORS } from "@nestjs/swagger";
import { ApiCreateProfileDocs } from "./api-create-profile-docs.decorator";
import { ApiGetCurrentProfileDocs } from "./api-get-current-profile-docs.decorator";

describe("Profile endpoint documentation", () => {
	it.each([
		{ decorator: ApiCreateProfileDocs, statuses: ["200", "201", "409", "default"] },
		{ decorator: ApiGetCurrentProfileDocs, statuses: ["200", "404", "default"] },
	])("documents all supported outcomes of $decorator", ({ decorator, statuses }) => {
		class Controller {
			method(): void {}
		}
		decorator()(Controller.prototype, "method", Object.getOwnPropertyDescriptor(Controller.prototype, "method")!);
		expect({
			security: Reflect.getMetadata(DECORATORS.API_SECURITY, Controller.prototype.method),
			statuses: Object.keys(Reflect.getMetadata(DECORATORS.API_RESPONSE, Controller.prototype.method)),
		}).toEqual({ security: [{ bearer: [] }], statuses: statuses });
	});
});
