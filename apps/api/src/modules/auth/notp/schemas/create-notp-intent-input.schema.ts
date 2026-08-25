import { z } from "zod";
import { NotpChannel } from "../enums/notp-channel.enum";

export const CreateNotpIntentInputSchema = z
	.object({
		channel: z.enum(NotpChannel, {
			error: `channel must be a supported NOTP channel (${Object.values(NotpChannel).join(", ")}). Example: WHATSAPP`,
		}),
	})
	.strict()
	.meta({ id: "CreateNotpIntentInput" });
