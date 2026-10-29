import { DECORATORS } from "@nestjs/swagger";
import { ApiJoinWaitlistDocs } from "./api-join-waitlist-docs.decorator";
import { ApiSkipWaitlistDocs } from "./api-skip-waitlist-docs.decorator";

it.each([
	{ decorator: ApiJoinWaitlistDocs, statuses: ["204", "default"] },
	{ decorator: ApiSkipWaitlistDocs, statuses: ["204", "403", "409", "422", "default"] },
])("documents the authenticated outcomes of $decorator", ({ decorator, statuses }) => {
	class Controller {
		method(): void {}
	}
	decorator()(Controller.prototype, "method", Object.getOwnPropertyDescriptor(Controller.prototype, "method")!);
	expect({
		security: Reflect.getMetadata(DECORATORS.API_SECURITY, Controller.prototype.method),
		statuses: Object.keys(Reflect.getMetadata(DECORATORS.API_RESPONSE, Controller.prototype.method)),
	}).toEqual({ security: [{ bearer: [] }], statuses: statuses });
});
