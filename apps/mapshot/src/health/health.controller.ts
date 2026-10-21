import {
	NativeRenderHealthOutputSchema,
	type NativeRenderHealthOutput,
} from "./schemas/native-render-health-output.schema";
import { AppErrorCode } from "../errors/app-error-code.enum";

export function createHealthHandler(params: {
	ready: () => boolean;
	indexes?: () => NativeRenderHealthOutput["indexes"];
}): (request: Request) => Response {
	return (request: Request): Response => {
		const url = new URL(request.url);
		const supportedTarget = request.method === "GET" && url.pathname === "/health" && url.search === "";
		if (!supportedTarget) return Response.json({ errorCode: AppErrorCode.NOT_FOUND }, { status: 404 });
		try {
			if (!params.ready()) return Response.json({ errorCode: AppErrorCode.NOT_READY }, { status: 503 });
			return Response.json(
				NativeRenderHealthOutputSchema.parse({
					ready: true,
					indexes: params.indexes?.(),
				}),
			);
		} catch {
			return Response.json({ errorCode: AppErrorCode.HEALTH_CHECK_FAILED }, { status: 500 });
		}
	};
}
