import { queueManifest } from "./queue.manifest";

describe("queueManifest", () => {
	it("should use each Queue base name as its manifest key", () => {
		expect(Object.keys(queueManifest)).toEqual(["cataqui-api-derive-job-data"]);
	});

	it("should map every Queue to its typed inbound receiver", () => {
		expect(queueManifest["cataqui-api-derive-job-data"].inboundReceiver).toBe("derive-job-data");
	});
});
