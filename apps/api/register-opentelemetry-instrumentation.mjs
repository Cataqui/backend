import { register } from "node:module";

function _escapeRegularExpression(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

register("@opentelemetry/instrumentation/hook.mjs", import.meta.url, {
	data: {
		exclude: [
			new RegExp(`^${_escapeRegularExpression(new URL("./src/", import.meta.url).href)}`),
			new RegExp(`^${_escapeRegularExpression(new URL("./dist/src/", import.meta.url).href)}`),
			new RegExp(`^${_escapeRegularExpression(new URL("./generated/", import.meta.url).href)}`),
		],
	},
});
