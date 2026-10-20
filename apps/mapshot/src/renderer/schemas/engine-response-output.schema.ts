import { z } from "zod";

/** Owned process framing fields; operation-specific bodies are validated before use. */
export const EngineResponseOutputSchema = z.discriminatedUnion("ok", [
	z.looseObject({ id: z.number().int().positive(), ok: z.literal(false), error: z.string() }),
	z.looseObject({ id: z.number().int().positive(), ok: z.literal(true) }),
]);
