import * as td from "testdouble";

const _decorators = await vi.hoisted(async () => {
	const td = await import("testdouble");
	return {
		applyDecorators: td.func<typeof import("@nestjs/common").applyDecorators>(),
		SerializeOptions: td.func<typeof import("@nestjs/common").SerializeOptions>(),
		ApiOperation: td.func<typeof import("@nestjs/swagger").ApiOperation>(),
		ApiResponse: td.func<typeof import("@nestjs/swagger").ApiResponse>(),
		ApiBearerAuth: td.func<typeof import("@nestjs/swagger").ApiBearerAuth>(),
		createSuccessResponseSchema: td.func<typeof import("@cataqui/response").createSuccessResponseSchema>(),
	};
});

vi.mock("@nestjs/common", async (importOriginal) => ({
	...(await importOriginal<typeof import("@nestjs/common")>()),
	applyDecorators: (
		...args: Parameters<typeof import("@nestjs/common").applyDecorators>
	): ReturnType<typeof import("@nestjs/common").applyDecorators> => _decorators.applyDecorators(...args),
	SerializeOptions: (
		...args: Parameters<typeof import("@nestjs/common").SerializeOptions>
	): ReturnType<typeof import("@nestjs/common").SerializeOptions> => _decorators.SerializeOptions(...args),
}));
vi.mock("@nestjs/swagger", () => ({
	ApiOperation: (
		...args: Parameters<typeof import("@nestjs/swagger").ApiOperation>
	): ReturnType<typeof import("@nestjs/swagger").ApiOperation> => _decorators.ApiOperation(...args),
	ApiResponse: (
		...args: Parameters<typeof import("@nestjs/swagger").ApiResponse>
	): ReturnType<typeof import("@nestjs/swagger").ApiResponse> => _decorators.ApiResponse(...args),
	ApiBearerAuth: (
		...args: Parameters<typeof import("@nestjs/swagger").ApiBearerAuth>
	): ReturnType<typeof import("@nestjs/swagger").ApiBearerAuth> => _decorators.ApiBearerAuth(...args),
}));
vi.mock("@cataqui/response", async (importOriginal) => ({
	...(await importOriginal<typeof import("@cataqui/response")>()),
	createSuccessResponseSchema: <T extends import("zod").ZodType>(
		...args: Parameters<typeof import("@cataqui/response").createSuccessResponseSchema<T>>
	): ReturnType<typeof import("@cataqui/response").createSuccessResponseSchema<T>> =>
		_decorators.createSuccessResponseSchema<T>(...args),
}));

import { ApiErrorResponseOutputSchema } from "../../../core/errors/api-error-response-output.schema";
import { ContactOutputSchema } from "../../contact/schemas/contact-output.schema";
import { PublicJobOutputSchema } from "../schemas/public-job-output.schema";
import { ApiActivateJobDocs } from "./api-activate-job-docs.decorator";
import { ApiArchiveJobDocs } from "./api-archive-job-docs.decorator";
import { ApiGetJobContactDocs } from "./api-get-job-contact-docs.decorator";

const { createSuccessResponseSchema: _createSuccessResponseSchema } =
	await vi.importActual<typeof import("@cataqui/response")>("@cataqui/response");

afterEach(() => td.reset());

beforeEach(() => {
	_decorators.applyDecorators = td.func<typeof import("@nestjs/common").applyDecorators>();
	_decorators.SerializeOptions = td.func<typeof import("@nestjs/common").SerializeOptions>();
	_decorators.ApiOperation = td.func<typeof import("@nestjs/swagger").ApiOperation>();
	_decorators.ApiResponse = td.func<typeof import("@nestjs/swagger").ApiResponse>();
	_decorators.ApiBearerAuth = td.func<typeof import("@nestjs/swagger").ApiBearerAuth>();
	_decorators.createSuccessResponseSchema = td.func<typeof import("@cataqui/response").createSuccessResponseSchema>();
});

it.each([
	{
		name: "archive",
		create: ApiArchiveJobDocs,
		operation: {
			summary: "Archive a posted job",
			description: "The poster can remove a job from the feed. Repeating this request returns the archived job.",
		},
		successDescription: "Job archived.",
	},
	{
		name: "activate",
		create: ApiActivateJobDocs,
		operation: {
			summary: "Activate an archived job",
			description: "The poster can return an archived job to the feed. Repeating this request returns the active job.",
		},
		successDescription: "Job active.",
	},
])("configures the $name response contract and composes its documentation decorators", (scenario) => {
	const responseSchema = _createSuccessResponseSchema({ dataSchema: PublicJobOutputSchema });
	const composed = td.func<ReturnType<typeof import("@nestjs/common").applyDecorators>>();
	const serialize = td.func<ReturnType<typeof import("@nestjs/common").SerializeOptions>>();
	const operation = td.func<ReturnType<typeof import("@nestjs/swagger").ApiOperation>>();
	const responses = Array.from({ length: 3 }, () =>
		td.func<ReturnType<typeof import("@nestjs/swagger").ApiResponse>>(),
	);
	td.when(_decorators.createSuccessResponseSchema<typeof PublicJobOutputSchema>(td.matchers.anything())).thenReturn(
		responseSchema,
	);
	td.when(_decorators.SerializeOptions(td.matchers.anything())).thenReturn(serialize);
	td.when(_decorators.ApiOperation(td.matchers.anything())).thenReturn(operation);
	td.when(_decorators.ApiResponse(td.matchers.anything())).thenReturn(responses[0]!, ...responses.slice(1));
	td.when(_decorators.applyDecorators(), { ignoreExtraArgs: true }).thenReturn(composed);
	const decorator = scenario.create();

	expect({
		schemas: td.explain(_decorators.createSuccessResponseSchema).calls.map((call) => call.args),
		serialization: td.explain(_decorators.SerializeOptions).calls.map((call) => call.args),
		operations: td.explain(_decorators.ApiOperation).calls.map((call) => call.args),
		responses: td.explain(_decorators.ApiResponse).calls.map((call) => call.args),
		authentication: td.explain(_decorators.ApiBearerAuth).callCount,
		composition: td.explain(_decorators.applyDecorators).calls.map((call) => call.args),
		decorator: decorator,
	}).toMatchObject({
		schemas: [
			[
				{
					dataSchema: PublicJobOutputSchema,
				},
			],
		],
		serialization: [[{ schema: responseSchema }]],
		operations: [[scenario.operation]],
		responses: [
			[{ status: 200, description: scenario.successDescription, standardSchema: responseSchema }],
			[
				{
					status: "default",
					description: "Application error. Inspect status, errorCode, and any validation violations.",
					standardSchema: ApiErrorResponseOutputSchema,
				},
			],
			[
				{
					status: 404,
					description: "The job does not exist or does not belong to this poster.",
					standardSchema: ApiErrorResponseOutputSchema,
				},
			],
		],
		authentication: 0,
		composition: [[serialize, operation, ...responses]],
		decorator: composed,
	});
});

it("configures authenticated contact lookup outcomes and the no-store response header", () => {
	const responseSchema = _createSuccessResponseSchema({ dataSchema: ContactOutputSchema });
	const composed = td.func<ReturnType<typeof import("@nestjs/common").applyDecorators>>();
	const serialize = td.func<ReturnType<typeof import("@nestjs/common").SerializeOptions>>();
	const operation = td.func<ReturnType<typeof import("@nestjs/swagger").ApiOperation>>();
	const responses = Array.from({ length: 3 }, () =>
		td.func<ReturnType<typeof import("@nestjs/swagger").ApiResponse>>(),
	);
	td.when(_decorators.createSuccessResponseSchema<typeof ContactOutputSchema>(td.matchers.anything())).thenReturn(
		responseSchema,
	);
	td.when(_decorators.SerializeOptions(td.matchers.anything())).thenReturn(serialize);
	td.when(_decorators.ApiOperation(td.matchers.anything())).thenReturn(operation);
	td.when(_decorators.ApiResponse(td.matchers.anything())).thenReturn(responses[0]!, ...responses.slice(1));
	td.when(_decorators.applyDecorators(), { ignoreExtraArgs: true }).thenReturn(composed);
	const decorator = ApiGetJobContactDocs();

	expect({
		schemas: td.explain(_decorators.createSuccessResponseSchema).calls.map((call) => call.args),
		serialization: td.explain(_decorators.SerializeOptions).calls.map((call) => call.args),
		operations: td.explain(_decorators.ApiOperation).calls.map((call) => call.args),
		responses: td.explain(_decorators.ApiResponse).calls.map((call) => call.args),
		authentication: td.explain(_decorators.ApiBearerAuth).callCount,
		composition: td.explain(_decorators.applyDecorators).calls.map((call) => call.args),
		decorator: decorator,
	}).toMatchObject({
		schemas: [[{ dataSchema: ContactOutputSchema }]],
		serialization: [[{ schema: responseSchema }]],
		operations: [[{ summary: "Get an active job's contact details" }]],
		responses: [
			[
				{
					status: 200,
					description: "Contact details for the active job.",
					standardSchema: responseSchema,
					headers: {
						"Cache-Control": {
							description: "Prevents storing the contact identifier.",
							schema: { type: "string", example: "no-store" },
						},
					},
				},
			],
			[
				{
					status: "default",
					description: "Application error. Inspect status, errorCode, and any validation violations.",
					standardSchema: ApiErrorResponseOutputSchema,
				},
			],
			[
				{
					status: 404,
					description: "The job is unavailable or does not use this contact.",
					standardSchema: ApiErrorResponseOutputSchema,
				},
			],
		],
		authentication: 0,
		composition: [[serialize, operation, ...responses]],
		decorator: composed,
	});
});
