import { applyDecorators, HttpStatus, SerializeOptions } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ApiErrorResponseOutputSchema } from "../../../core/errors/api-error-response-output.schema";
import { createSuccessResponseSchema } from "@cataqui/response";
import { SavedContactsOutputSchema } from "../../contact/schemas/saved-contacts-output.schema";
import { ApiGetCurrentProfileContactsDocs } from "./api-get-current-profile-contacts-docs.decorator";

import * as td from "testdouble";

const _mocks = await vi.hoisted(async () => {
	const td = await import("testdouble");
	return {
		applyDecorators: td.func<typeof import("@nestjs/common").applyDecorators>(),
		SerializeOptions: td.func<typeof import("@nestjs/common").SerializeOptions>(),
		ApiBearerAuth: td.func<typeof import("@nestjs/swagger").ApiBearerAuth>(),
		ApiOperation: td.func<typeof import("@nestjs/swagger").ApiOperation>(),
		ApiResponse: td.func<typeof import("@nestjs/swagger").ApiResponse>(),
		createSuccessResponseSchema: td.func<typeof import("@cataqui/response").createSuccessResponseSchema>(),
	};
});

vi.mock("@nestjs/common", async (importOriginal) => ({
	...(await importOriginal<typeof import("@nestjs/common")>()),
	get applyDecorators(): typeof _mocks.applyDecorators {
		return _mocks.applyDecorators;
	},
	get SerializeOptions(): typeof _mocks.SerializeOptions {
		return _mocks.SerializeOptions;
	},
}));
vi.mock("@nestjs/swagger", () => ({
	get ApiBearerAuth(): typeof _mocks.ApiBearerAuth {
		return _mocks.ApiBearerAuth;
	},
	get ApiOperation(): typeof _mocks.ApiOperation {
		return _mocks.ApiOperation;
	},
	get ApiResponse(): typeof _mocks.ApiResponse {
		return _mocks.ApiResponse;
	},
}));
vi.mock("@cataqui/response", async (importOriginal) => ({
	...(await importOriginal<typeof import("@cataqui/response")>()),
	get createSuccessResponseSchema(): typeof _mocks.createSuccessResponseSchema {
		return _mocks.createSuccessResponseSchema;
	},
}));

afterEach(() => td.reset());

beforeEach(() => {
	_mocks.applyDecorators = td.func<typeof applyDecorators>();
	_mocks.SerializeOptions = td.func<typeof SerializeOptions>();
	_mocks.ApiBearerAuth = td.func<typeof ApiBearerAuth>();
	_mocks.ApiOperation = td.func<typeof ApiOperation>();
	_mocks.ApiResponse = td.func<typeof ApiResponse>();
	_mocks.createSuccessResponseSchema = td.func<typeof createSuccessResponseSchema>();
});

it("configures ApiGetCurrentProfileContactsDocs through the public decorator APIs", async () => {
	const actual = await vi.importActual<typeof import("@cataqui/response")>("@cataqui/response");
	const _responseSchema = actual.createSuccessResponseSchema({ dataSchema: SavedContactsOutputSchema });
	const serialization = td.func<ReturnType<typeof SerializeOptions>>();
	const bearer = td.func<ReturnType<typeof ApiBearerAuth>>();
	const operation = td.func<ReturnType<typeof ApiOperation>>();
	const responses = Array.from({ length: 2 }, () => td.func<ReturnType<typeof ApiResponse>>());
	const composed = td.func<ReturnType<typeof applyDecorators>>();
	td.when(createSuccessResponseSchema(td.matchers.anything())).thenReturn(_responseSchema);
	td.when(SerializeOptions(td.matchers.anything())).thenReturn(serialization);
	td.when(ApiBearerAuth()).thenReturn(bearer);
	td.when(ApiOperation(td.matchers.anything())).thenReturn(operation);
	td.when(ApiResponse(td.matchers.anything())).thenReturn(responses[0]!, ...responses.slice(1));
	td.when(applyDecorators(td.matchers.anything()), { ignoreExtraArgs: true }).thenReturn(composed);

	const decorator = ApiGetCurrentProfileContactsDocs();

	expect({
		schema: td.explain(createSuccessResponseSchema).calls.map((call) => call.args),
		serialization: td.explain(SerializeOptions).calls.map((call) => call.args),
		auth: td.explain(ApiBearerAuth).calls.map((call) => call.args),
		operation: td.explain(ApiOperation).calls.map((call) => call.args),
		responses: td.explain(ApiResponse).calls.map((call) => call.args),
		composition: td.explain(applyDecorators).calls.map((call) => call.args),
		decorator: decorator,
	}).toMatchObject({
		schema: [[{ dataSchema: SavedContactsOutputSchema }]],
		serialization: [[{ schema: _responseSchema }]],
		auth: [[]],
		operation: [
			[
				{
					summary: "Get saved contacts",
					description: "Returns the authenticated profile's contacts available for job posts",
				},
			],
		],
		responses: [
			[
				{
					status: HttpStatus.OK,
					description: "Saved contacts returned for the authenticated profile.",
					standardSchema: _responseSchema,
				},
			],
			[
				{
					status: "default",
					description: "Application error. Inspect status, errorCode, and any validation violations.",
					standardSchema: ApiErrorResponseOutputSchema,
				},
			],
		],
		composition: [[serialization, bearer, operation, ...responses]],
		decorator: composed,
	});
});
