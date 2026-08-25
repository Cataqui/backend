import { z } from "zod";
import { AuthSessionOutputSchema } from "../../schemas/auth-session-output.schema";
import { NotpIntentPendingOutputSchema } from "./notp-intent-pending-output.schema";

export const NotpIntentExchangeOutputSchema = z
	.union([NotpIntentPendingOutputSchema, AuthSessionOutputSchema])
	.meta({ id: "NotpIntentExchangeOutput" });
