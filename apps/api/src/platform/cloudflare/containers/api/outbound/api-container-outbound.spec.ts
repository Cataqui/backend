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

		const requestOptions = fetchMock.mock.calls[0]?.[1] as RequestInit;
		expect({
			body: requestOptions.body,
			contentType: new Headers(requestOptions.headers).get("content-type"),
			method: requestOptions.method,
			url: fetchMock.mock.calls[0]?.[0],
		}).toEqual({
			body: JSON.stringify({ jobId: jobId }),
			contentType: "application/json",
			method: "POST",
			url: "http://derive-job-data.queue",
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
