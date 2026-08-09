import { getQueueConsumerPath } from "./queue.manifest";

describe("getQueueConsumerPath", () => {
	it("should derive the internal consumer path from a Queue declared in the manifest", () => {
		expect(getQueueConsumerPath({ queueName: "cataqui-api-derive-job-data" })).toBe(
			"internal/queues/cataqui-api-derive-job-data",
		);
	});
});
