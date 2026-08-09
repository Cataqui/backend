import { z } from "zod";
import { AuthSessionOutputSchema } from "../../schemas/auth-session-output.schema";
import { AuthIntentPendingOutputSchema } from "./auth-intent-pending-output.schema";

export const AuthIntentExchangeOutputSchema = z
	.union([AuthIntentPendingOutputSchema, AuthSessionOutputSchema])
	.meta({ id: "AuthIntentExchangeOutput" });
