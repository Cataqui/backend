import { DeriveJobDataQueueConstants } from "../../queues/derive-job-data/derive-job-data-queue.constants";
import { DeriveJobDataOutboundHandler } from "./derive-job-data.outbound-handler";
import { OutboundHandlers } from "./outbound-handlers";

describe("OutboundHandlers", () => {
	it("should route the derive job data host to its outbound handler", () => {
		expect(OutboundHandlers[DeriveJobDataQueueConstants.OUTBOUND_HOST]).toBe(DeriveJobDataOutboundHandler.publish);
	});
});
