export async function raceWithSignal<T>(
	operation: () => Promise<T>,
	options: { signal?: AbortSignal | undefined; createAbortError?: () => Error } = {},
): Promise<T> {
	const signal = options.signal;
	if (signal?.aborted) throw options.createAbortError === undefined ? signal.reason : options.createAbortError();
	if (signal === undefined) return operation();

	let settled = false;
	const result = Promise.withResolvers<T>();
	const abort = (): void => {
		if (settled) return;
		settled = true;
		result.reject(options.createAbortError === undefined ? signal.reason : options.createAbortError());
	};
	signal.addEventListener("abort", abort, { once: true });
	try {
		void operation().then(
			(value) => {
				settled = true;
				result.resolve(value);
			},
			(error: unknown) => {
				settled = true;
				result.reject(error);
			},
		);
	} catch (error) {
		settled = true;
		result.reject(error);
	}
	try {
		return await result.promise;
	} finally {
		signal.removeEventListener("abort", abort);
	}
}
