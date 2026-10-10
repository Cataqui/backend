import type { z } from "zod";
import type { ApiWorkerEnvironment } from "../../../api-worker-environment";

export function defineWorkerMethod<Input extends z.ZodType, Result extends z.ZodType>(params: {
	input: Input;
	result: Result;
	execute: (params: { input: z.output<Input>; env: ApiWorkerEnvironment }) => Promise<z.input<Result>>;
}) {
	return {
		input: params.input,
		result: params.result,
		async execute(context: { input: unknown; env: ApiWorkerEnvironment }) {
			const parsed = params.input.safeParse(context.input);
			if (!parsed.success)
				return {
					kind: "invalid-input" as const,
					violations: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
				};
			const result = await params.execute({ input: parsed.data, env: context.env });
			return { kind: "success" as const, result: params.result.parse(result) };
		},
	};
}
