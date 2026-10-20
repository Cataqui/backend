import { z } from "zod";

// Separate GitHub jobs advance the same stored source preparation.
export const SourceImportPhaseSchema = z.enum(["transfer", "verify", "prepare"]);
export type SourceImportPhase = z.output<typeof SourceImportPhaseSchema>;
