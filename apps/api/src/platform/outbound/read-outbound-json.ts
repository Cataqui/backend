export async function readOutboundJson(params: {
	stream: ReadableStream<Uint8Array> | null;
	maxBytes: number;
}): Promise<unknown> {
	if (params.stream === null) throw new Error("Missing outbound body");
	const reader = params.stream.getReader();
	const decoder = new TextDecoder();
	let text = "";
	let size = 0;
	try {
		for (;;) {
			const chunk = await reader.read();
			if (chunk.done) break;
			size += chunk.value.byteLength;
			if (size > params.maxBytes) {
				await reader.cancel();
				throw new Error("Outbound body exceeds its limit");
			}
			text += decoder.decode(chunk.value, { stream: true });
		}
		return JSON.parse(text + decoder.decode());
	} finally {
		reader.releaseLock();
	}
}
