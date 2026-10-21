import { sValidator } from "@hono/standard-validator";
import { Hono } from "hono";
import { z } from "zod";
import { createMapsValidationHook } from "./maps-validation.hook";
import type { MapsContext } from "./context";

it("returns sanitized Zod issues and nested array paths through Hono validation", async () => {
	const schema = z.strictObject({ items: z.array(z.object({ count: z.number().positive("Must be positive.") })) });
	const app = new Hono<MapsContext>();
	app.use("*", async (context, next) => {
		context.set("requestId", "request-1");
		await next();
	});
	app.post(
		"/",
		sValidator("json", schema, createMapsValidationHook({ message: "Invalid request.", fallbackPath: "body" })),
		(context) => context.json({ ok: true }),
	);
	const response = await app.request("/", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ items: [{ count: -1 }], "submitted-secret-key": true }),
	});
	expect(response.status).toBe(400);
	expect(await response.json()).toEqual({
		status: expect.any(Number),
		requestId: expect.any(String),
		timestamp: expect.any(String),
		endpoint: expect.any(String),
		errorCode: "INVALID_REQUEST",
		message: "Invalid request.",
		violations: [
			{ path: ["items", 0, "count"], message: "Must be positive." },
			{ path: ["body"], message: "Only documented fields are supported." },
		],
	});
});

it.each(["body", "query", "params"])("uses the %s location only for a root issue", async (location) => {
	const app = new Hono<MapsContext>();
	app.use("*", async (context, next) => {
		context.set("requestId", "request-1");
		await next();
	});
	app.post(
		"/",
		sValidator(
			"json",
			z.array(z.string()),
			createMapsValidationHook({ message: "Invalid request.", fallbackPath: location }),
		),
		(context) => context.json({ ok: true }),
	);
	const response = await app.request("/", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: "{}",
	});
	expect(await response.json()).toMatchObject({ violations: [{ path: [location], message: expect.any(String) }] });
});

it("continues to the handler for valid input", async () => {
	const app = new Hono<MapsContext>();
	app.use("*", async (context, next) => {
		context.set("requestId", "request-1");
		await next();
	});
	app.post(
		"/",
		sValidator(
			"json",
			z.object({ count: z.number() }),
			createMapsValidationHook({ message: "Invalid request.", fallbackPath: "body" }),
		),
		(context) => context.json({ ok: true }),
	);
	const response = await app.request("/", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: '{"count":1}',
	});
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({ ok: true });
});
