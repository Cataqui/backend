import { NotpChannel } from "../enums/notp-channel.enum";
import { CreateNotpIntentInputSchema } from "./create-notp-intent-input.schema";

describe("CreateNotpIntentInputSchema", () => {
	it("should accept a supported NOTP channel", () => {
		expect(CreateNotpIntentInputSchema.parse({ channel: "WHATSAPP" }).channel).toBe(NotpChannel.WHATSAPP);
	});

	it("should reject an unsupported NOTP channel", () => {
		expect(CreateNotpIntentInputSchema.safeParse({ channel: "EMAIL" }).success).toBe(false);
	});
});
