import { DeriveJobDataQueueMessageSchema } from "../../../queues/schemas/derive-job-data-queue-message.schema";
import { type ApiContainerOutboundHost, apiContainerOutboundManifest } from "./api-container-outbound.manifest";

const jobId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("API container outbound manifest", () => {
	it("should expose the body schema for every typed container caller", () => {
		expect(apiContainerOutboundManifest[0].bodySchema).toBe(DeriveJobDataQueueMessageSchema);
	});

	it("should expose the virtual host used by the container caller", () => {
		expect(apiContainerOutboundManifest[0].outboundHost).toBe("derive-job-data.queue");
	});

	it("should preserve every outbound host as a literal type", () => {
		expectTypeOf<ApiContainerOutboundHost>().toEqualTypeOf<"derive-job-data.queue">();
	});

	it("should execute Queue publication through the generated Worker environment", async () => {
		const send = vi.fn().mockResolvedValue(undefined);

		await apiContainerOutboundManifest[0].execute({
			body: { jobId: jobId },
			environment: { DERIVE_JOB_DATA_QUEUE: { send: send } } as unknown as ApiWorkerEnv,
		});

		expect(send).toHaveBeenCalledWith({ jobId: jobId });
	});
});
