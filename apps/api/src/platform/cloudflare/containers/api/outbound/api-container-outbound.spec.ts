import { outboundCall } from "./api-container-outbound";

const jobId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("outboundCall", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("should send the typed body to the selected virtual host", async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
		vi.stubGlobal("fetch", fetchMock);

		await outboundCall({
			host: "derive-job-data.queue",
			body: { jobId: jobId },
		});

		expect(fetchMock).toHaveBeenCalledWith("http://derive-job-data.queue", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ jobId: jobId }),
		});
	});

	it("should return the outbound handler response", async () => {
		const expectedResponse = new Response(null, { status: 503 });
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(expectedResponse));

		const response = await outboundCall({
			host: "derive-job-data.queue",
			body: { jobId: jobId },
		});

		expect(response).toBe(expectedResponse);
	});
});
