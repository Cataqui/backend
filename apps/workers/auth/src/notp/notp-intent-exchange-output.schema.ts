import { z } from "zod";
import { SessionOutputSchema } from "../session/session-output.schema";
import { NotpIntentPendingOutputSchema } from "./notp-intent-pending-output.schema";

export const NotpIntentExchangeOutputSchema = z
	.union([NotpIntentPendingOutputSchema, SessionOutputSchema])
	.meta({ id: "NotpIntentExchangeOutput" });
