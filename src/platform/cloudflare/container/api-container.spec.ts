vi.mock("@cloudflare/containers", () => ({ Container: class {}, ContainerProxy: class {} }));

import { DeriveJobDataQueueConstants } from "../queues/derive-job-data/derive-job-data-queue.constants";
import { ApiContainer } from "./api-container";

describe("ApiContainer request boundary", () => {
	it("should hide internal paths from externally forwarded requests", async () => {
		const containerFetch = vi.fn();
		const container = { containerFetch: containerFetch } as unknown as ApiContainer;

		const response = await ApiContainer.prototype.fetch.call(
			container,
			new Request(`https://api.cataqui.com/internal/job/id/${DeriveJobDataQueueConstants.INTERNAL_ROUTE}`, {
				method: "POST",
			}),
		);

		expect(response.status).toBe(404);
	});

	it("should not forward hidden internal paths to Nest", async () => {
		const containerFetch = vi.fn();
		const container = { containerFetch: containerFetch } as unknown as ApiContainer;

		await ApiContainer.prototype.fetch.call(
			container,
			new Request(`https://api.cataqui.com/internal/job/id/${DeriveJobDataQueueConstants.INTERNAL_ROUTE}`, {
				method: "POST",
			}),
		);

		expect(containerFetch).not.toHaveBeenCalled();
	});

	it("should continue forwarding public requests to Nest", async () => {
		const expectedResponse = new Response("ok");
		const containerFetch = vi.fn().mockResolvedValue(expectedResponse);
		const container = { containerFetch: containerFetch } as unknown as ApiContainer;
		const request = new Request("https://api.cataqui.com/v1/job/draft", { method: "POST" });

		const response = await ApiContainer.prototype.fetch.call(container, request);

		expect(response).toBe(expectedResponse);
	});
});
