import { z } from "zod";
import { NotpChannel } from "./notp-channel.enum";

export const CreateNotpIntentInputSchema = z
	.object({ channel: z.enum(NotpChannel) })
	.strict()
	.meta({ id: "CreateNotpIntentInput" });
