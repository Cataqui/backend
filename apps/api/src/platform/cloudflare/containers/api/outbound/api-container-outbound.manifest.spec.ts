import { DeriveJobDataInputSchema } from "@cataqui/api-internal-ingress";
import { type ApiContainerOutboundHost, apiContainerOutboundManifest } from "./api-container-outbound.manifest";

const jobId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("API container outbound manifest", () => {
	it("should expose the body schema for every typed container caller", () => {
		expect(apiContainerOutboundManifest["derive-job-data.queue"].bodySchema).toBe(DeriveJobDataInputSchema);
	});

	it("should use each outbound virtual host as its manifest key", () => {
		expect(Object.keys(apiContainerOutboundManifest)).toEqual(["derive-job-data.queue"]);
	});

	it("should preserve every outbound host as a literal type", () => {
		expectTypeOf<ApiContainerOutboundHost>().toEqualTypeOf<"derive-job-data.queue">();
	});

	it("should execute Queue publication through the generated Worker environment", async () => {
		const send = vi.fn().mockResolvedValue(undefined);

		await apiContainerOutboundManifest["derive-job-data.queue"].execute({
			body: { jobId: jobId },
			environment: { DERIVE_JOB_DATA_QUEUE: { send: send } } as unknown as ApiWorkerEnv,
		});

		expect(send).toHaveBeenCalledWith({ jobId: jobId });
	});
});
