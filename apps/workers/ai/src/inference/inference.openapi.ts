import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import { AiErrorCode } from "../errors/ai-error-code.enum";
import { AiErrorResponseOutputSchema } from "../http/ai-error-response-output.schema";
import { NameAnalysisHeadersInputSchema } from "./name-analysis-headers-input.schema";
import { NameAnalysisInputSchema } from "./name-analysis-input.schema";
import { NameAnalysisResponseOutputSchema } from "./name-analysis-response-output.schema";
import { RateLimitConfig } from "./rate-limit.config";

export const analyzeNameDocs = describeRoute({
	operationId: "analyzeName",
	summary: "Analyze a personal name",
	description: "Get information about a supplied name such as given name, meaning etc.",
	parameters: [
		{
			name: "Accept-Language",
			in: "header",
			required: true,
			description:
				"Required BCP 47 language tag for the meaning. The first language is used and canonicalized; names are never translated.",
			schema: z.toJSONSchema(NameAnalysisHeadersInputSchema.shape["accept-language"], { io: "input" }) as {
				type: "string";
			},
			example: "pt-BR" satisfies z.input<typeof NameAnalysisHeadersInputSchema>["accept-language"],
		},
	],
	requestBody: {
		required: true,
		content: {
			"application/json": {
				schema: resolver(NameAnalysisInputSchema),
				examples: {
					meaningAvailable: {
						summary: "A given name with a known meaning",
						value: { name: "Maria Clara da Silva" } satisfies z.input<typeof NameAnalysisInputSchema>,
					},
					meaningUnknown: {
						summary: "A name without a known meaning",
						value: { name: "Qzxvplmn Silva" } satisfies z.input<typeof NameAnalysisInputSchema>,
					},
					unidentified: {
						summary: "Input without an identifiable given name",
						value: { name: "1234" } satisfies z.input<typeof NameAnalysisInputSchema>,
					},
				},
			},
		},
	},
	responses: {
		"200": {
			description: "Analysis in the standard success envelope. ",
			content: {
				"application/json": {
					schema: resolver(NameAnalysisResponseOutputSchema),
					examples: {
						meaningAvailable: {
							summary: "Given name and meaning identified",
							value: {
								data: { givenName: "Maria Clara", meaning: "senhora soberana luminosa" },
								requestId: "analysis-request",
								timestamp: "2026-10-30T12:00:00.000Z",
								endpoint: "/v1/inference/name-analysis",
							} satisfies z.output<typeof NameAnalysisResponseOutputSchema>,
						},
						meaningUnknown: {
							summary: "Given name identified, whole-name meaning unknown",
							value: {
								data: { givenName: "Qzxvplmn", meaning: null },
								requestId: "analysis-request",
								timestamp: "2026-10-30T12:00:00.000Z",
								endpoint: "/v1/inference/name-analysis",
							} satisfies z.output<typeof NameAnalysisResponseOutputSchema>,
						},
						unidentified: {
							summary: "No given name identified",
							value: {
								data: { givenName: null, meaning: null },
								requestId: "analysis-request",
								timestamp: "2026-10-30T12:00:00.000Z",
								endpoint: "/v1/inference/name-analysis",
							} satisfies z.output<typeof NameAnalysisResponseOutputSchema>,
						},
					},
				},
			},
		},
		"400": {
			description:
				"Invalid JSON, name or language. Correct the fields identified by violations; paths identify body or header locations.",
			content: {
				"application/json": {
					schema: resolver(AiErrorResponseOutputSchema),
					example: {
						errorCode: AiErrorCode.INVALID_INPUT,
						message: "The request input is invalid.",
						status: 400,
						requestId: "analysis-request",
						timestamp: "2026-10-30T12:00:00.000Z",
						endpoint: "/v1/inference/name-analysis",
						violations: [{ path: ["body", "name"], message: "Expected a nonblank name." }],
					} satisfies z.output<typeof AiErrorResponseOutputSchema>,
				},
			},
		},
		"429": {
			description: `The account exceeded ${RateLimitConfig.nameAnalysis.limit} requests per ${RateLimitConfig.nameAnalysis.period} seconds. Wait before retrying.`,
			headers: { "Retry-After": { description: "Seconds to wait before retrying.", schema: { type: "integer" } } },
			content: {
				"application/json": {
					schema: resolver(AiErrorResponseOutputSchema),
					example: {
						errorCode: AiErrorCode.NAME_ANALYSIS_LIMIT,
						message: "The account name-analysis request limit was reached.",
						status: 429,
						requestId: "analysis-request",
						timestamp: "2026-10-30T12:00:00.000Z",
						endpoint: "/v1/inference/name-analysis",
					} satisfies z.output<typeof AiErrorResponseOutputSchema>,
				},
			},
		},
		default: {
			description:
				"Owned application error. Inspect status and errorCode; diagnostic messages are for developers and clients localize user-facing copy.",
			content: {
				"application/json": {
					schema: resolver(AiErrorResponseOutputSchema),
					example: {
						errorCode: AiErrorCode.INTERNAL_ERROR,
						message: "An unexpected error occurred.",
						status: 500,
						requestId: "analysis-request",
						timestamp: "2026-10-30T12:00:00.000Z",
						endpoint: "/v1/inference/name-analysis",
					} satisfies z.output<typeof AiErrorResponseOutputSchema>,
				},
			},
		},
	},
});
