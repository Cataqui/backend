import { toValidationViolations } from "@cataqui/response";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { AuthService } from "../auth/auth.service";
import { AuthorizationInputSchema } from "../auth/authorization-input.schema";
import { UnauthenticatedError } from "../auth/errors/unauthenticated.error";
import { BodyTooLargeError } from "../errors/body-too-large.error";
import { InvalidInputError } from "../errors/invalid-input.error";
import type { AiContext } from "../http/context";
import { NameAnalysisLimitError } from "./errors/name-analysis-limit.error";
import { analyzeNameDocs } from "./inference.openapi";
import { InferenceService } from "./inference.service";
import { NameAnalysisHeadersInputSchema } from "./name-analysis-headers-input.schema";
import { NameAnalysisInputSchema } from "./name-analysis-input.schema";
import { NameAnalysisResponseOutputSchema } from "./name-analysis-response-output.schema";

export const inferenceRoutes = new Hono<AiContext>();

inferenceRoutes.post(
	"/name-analysis",
	analyzeNameDocs,
	bodyLimit({
		maxSize: 4096,
		onError: () => {
			throw new BodyTooLargeError();
		},
	}),
	async (context) => {
		const authorization = AuthorizationInputSchema.safeParse(context.req.header("Authorization"));
		if (!authorization.success) throw new UnauthenticatedError();

		const authService = context.var.resolve(AuthService);
		const accountId = await authService.authenticate({ accessToken: authorization.data });

		let body: unknown;
		try {
			body = await context.req.json();
		} catch {
			throw new InvalidInputError({ violations: [{ path: ["body"], message: "Expected a valid JSON body." }] });
		}

		const input = NameAnalysisInputSchema.safeParse(body);
		const headers = NameAnalysisHeadersInputSchema.safeParse({
			"accept-language": context.req.header("Accept-Language"),
		});

		const violations = [
			...(!input.success
				? toValidationViolations({ issues: input.error.issues }).map((violation) => ({
						path: ["body", ...violation.path],
						message: violation.message,
					}))
				: []),
			...(!headers.success
				? toValidationViolations({ issues: headers.error.issues }).map((violation) => ({
						path: ["header", ...violation.path],
						message: violation.message,
					}))
				: []),
		];

		if (!input.success || !headers.success) throw new InvalidInputError({ violations: violations });

		const limit = await context.env.NAME_ANALYSIS_RATE_LIMITER.limit({
			key: `${context.env.ENVIRONMENT}:${accountId}`,
		});

		if (!limit.success) throw new NameAnalysisLimitError();

		const inferenceService = context.var.resolve(InferenceService);

		const data = await inferenceService.analyseName({
			name: input.data.name,
			language: headers.data["accept-language"],
			signal: context.req.raw.signal,
		});

		return context.json(
			NameAnalysisResponseOutputSchema.encode({
				data: data,
				requestId: context.get("requestId"),
				timestamp: new Date().toISOString(),
				endpoint: context.req.path,
			}),
			200,
		);
	},
);
