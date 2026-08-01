async function publish<MESSAGE>(params: {
	request: Request;
	queue: Queue<MESSAGE>;
	parseMessage: (requestBody: unknown) => MESSAGE | null;
}): Promise<Response> {
	if (params.request.method !== "POST") return new Response(null, { status: 405 });

	let requestBody: unknown;

	try {
		requestBody = await params.request.json();
	} catch {
		return new Response(null, { status: 400 });
	}

	const message = params.parseMessage(requestBody);
	if (message === null) return new Response(null, { status: 400 });

	try {
		await params.queue.send(message);
		return new Response(null, { status: 204 });
	} catch {
		return new Response(null, { status: 503 });
	}
}

export const QueuePublisher = {
	publish,
} as const;
