import { NotpChannel } from "./enums/notp-channel.enum";
import { notpConfig } from "./notp.config";

describe("notpConfig", () => {
	it("should map every NOTP channel to its code receiver", () => {
		vi.stubEnv("WHATSAPP_NOTP_RECEIVER", "+5511963270517");

		expect(notpConfig()).toEqual({
			codeReceiverByChannel: {
				[NotpChannel.WHATSAPP]: "+5511963270517",
			},
		});
	});
});
