// Loaded with `node --import` so OpenTelemetry can instrument ES modules such as Fastify and NestJS.
// The application's own compiled code is excluded because nothing in it needs patching.
import { register } from "node:module";

register("@opentelemetry/instrumentation/hook.mjs", import.meta.url, {
	data: {
		exclude: [new RegExp(`^${new URL("./dist/", import.meta.url).href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)],
	},
});
