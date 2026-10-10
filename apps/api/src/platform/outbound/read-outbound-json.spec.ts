import { readOutboundJson } from "./read-outbound-json";
it("reads JSON split across UTF-8 chunks", async () => {
	const bytes = new TextEncoder().encode('{"value":"é"}');
	const stream = new ReadableStream({
		start(controller) {
			for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
			controller.close();
		},
	});
	expect(await readOutboundJson({ stream: stream, maxBytes: 30 })).toEqual({ value: "é" });
});
it("rejects an absent body", async () => {
	await expect(readOutboundJson({ stream: null, maxBytes: 10 })).rejects.toThrow("Missing outbound body");
});
it("cancels an oversized body", async () => {
	const cancel = vi.fn();
	const stream = new ReadableStream({
		start(controller) {
			controller.enqueue(new Uint8Array(11));
		},
		cancel: cancel,
	});
	await readOutboundJson({ stream: stream, maxBytes: 10 }).catch(() => undefined);
	expect(cancel).toHaveBeenCalledOnce();
});
it("rejects malformed JSON", async () => {
	await expect(readOutboundJson({ stream: new Response("no").body, maxBytes: 10 })).rejects.toThrow();
});
