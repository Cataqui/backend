import { QueuePublisher } from "./queue-publisher";

const message = { value: "job-data" };

describe("QueuePublisher", () => {
	it("should reject methods other than POST", async () => {
		const response = await QueuePublisher.publish({
			request: new Request("http://queue.test", { method: "GET" }),
			queue: { send: vi.fn() } as never,
			parseMessage: vi.fn(),
		});

		expect(response.status).toBe(405);
	});

	it("should reject malformed JSON", async () => {
		const response = await QueuePublisher.publish({
			request: new Request("http://queue.test", { method: "POST", body: "not-json" }),
			queue: { send: vi.fn() } as never,
			parseMessage: vi.fn(),
		});

		expect(response.status).toBe(400);
	});

	it("should reject request bodies that cannot become a queue message", async () => {
		const response = await QueuePublisher.publish({
			request: new Request("http://queue.test", { method: "POST", body: "{}" }),
			queue: { send: vi.fn() } as never,
			parseMessage: vi.fn().mockReturnValue(null),
		});

		expect(response.status).toBe(400);
	});

	it("should send a parsed message through the queue binding", async () => {
		const send = vi.fn().mockResolvedValue(undefined);

		await QueuePublisher.publish({
			request: new Request("http://queue.test", { method: "POST", body: "{}" }),
			queue: { send: send } as never,
			parseMessage: vi.fn().mockReturnValue(message),
		});

		expect(send).toHaveBeenCalledWith(message);
	});

	it("should return no content after publishing", async () => {
		const response = await QueuePublisher.publish({
			request: new Request("http://queue.test", { method: "POST", body: "{}" }),
			queue: { send: vi.fn().mockResolvedValue(undefined) } as never,
			parseMessage: vi.fn().mockReturnValue(message),
		});

		expect(response.status).toBe(204);
	});

	it("should return unavailable when the queue binding rejects the message", async () => {
		const response = await QueuePublisher.publish({
			request: new Request("http://queue.test", { method: "POST", body: "{}" }),
			queue: { send: vi.fn().mockRejectedValue(new Error("queue unavailable")) } as never,
			parseMessage: vi.fn().mockReturnValue(message),
		});

		expect(response.status).toBe(503);
	});
});
