import type { OutboundHandler } from "@cloudflare/containers";
import { WorkerManifest } from "../../outbound/worker-manifest";
import { WorkerCallInputSchema } from "../../outbound/worker-call-input.schema";
import { readOutboundJson } from "../../outbound/read-outbound-json";

export const OutboundHandlers: Record<string, OutboundHandler> = Object.fromEntries(
	Object.values(WorkerManifest).map((worker) => [
		worker.host,
		async (request: Request, env: Cloudflare.Env) => {
			if (request.method !== "POST" || new URL(request.url).pathname !== "/")
				return new Response(null, { status: 404 });
			let body: unknown;
			try {
				body = await readOutboundJson({ stream: request.body, maxBytes: 4096 });
			} catch {
				return new Response(null, { status: 400 });
			}
			const parsed = WorkerCallInputSchema.safeParse(body);
			if (!parsed.success)
				return Response.json(
					{
						violations: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
					},
					{ status: 400 },
				);
			const method = Object.entries(worker.methods).find(([name]) => name === parsed.data.method)?.[1];
			if (method === undefined) return new Response(null, { status: 404 });
			try {
				const result = await method.execute({ input: parsed.data.input, env: env });
				if (result.kind === "invalid-input") return Response.json({ violations: result.violations }, { status: 400 });
				return Response.json(result.result, { headers: { "Cache-Control": "no-store" } });
			} catch {
				return new Response(null, { status: 503 });
			}
		},
	]),
);
