import { createGeoapifyHttpError } from "./geoapify-http.error";
beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());
it.each([
	["3", 3000],
	[" 0 ", 0],
	["Fri, 02 Oct 2026 12:00:04 GMT", 4000],
	["Fri, 02 Oct 2026 11:59:00 GMT", 0],
	["Fri, invalid", undefined],
	["", undefined],
	["-1", undefined],
	["1.5", undefined],
	["invalid", undefined],
	["9".repeat(400), Number.MAX_VALUE],
])("parses Retry-After %s without retrying earlier than requested", (value, milliseconds) => {
	const error = createGeoapifyHttpError({
		response: new Response(null, { status: 429, headers: { "Retry-After": value } }),
	});
	expect(error).toMatchObject({ retryable: true, retryAfterMs: milliseconds });
});
it.each([429, 500, 502, 503, 504])("allows transient HTTP %s", (status) => {
	expect(createGeoapifyHttpError({ response: new Response(null, { status: status }) }).retryable).toBe(true);
});
it.each([301, 400, 401, 403, 404, 422])("does not retry terminal HTTP %s", (status) => {
	expect(createGeoapifyHttpError({ response: new Response(null, { status: status }) }).retryable).toBe(false);
});
it("honors Retry-After on 503", () => {
	expect(
		createGeoapifyHttpError({
			response: new Response(null, { status: 503, headers: { "Retry-After": "8" } }),
		}).retryAfterMs,
	).toBe(8000);
});
