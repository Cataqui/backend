import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { Observable } from "rxjs";
import { map } from "rxjs";
import { SKIP_ENVELOPE_KEY } from "../../shared/decorators/skip-envelope.decorator";
import { PaginatedResult } from "../../shared/results/paginated-result";
import { RequestUtils } from "../../shared/utils/request.utils";

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
	intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
		const skipEnvelope = (Reflect.getOwnMetadata(SKIP_ENVELOPE_KEY, context.getHandler()) ??
			Reflect.getMetadata(SKIP_ENVELOPE_KEY, context.getClass())) as boolean | undefined;

		if (skipEnvelope) {
			return next.handle();
		}

		const request = context.switchToHttp().getRequest<FastifyRequest>();
		const requestId = RequestUtils.getOrCreateRequestId(request);
		const timestamp = new Date().toISOString();
		const endpoint = RequestUtils.getPathWithoutQuery(request);

		return next.handle().pipe(
			map((data: unknown) => {
				if (data === null || data === undefined) return data;

				return PaginatedResult.is(data)
					? {
							data: data.data,
							pagination: data.pagination,
							requestId: requestId,
							timestamp: timestamp,
							endpoint: endpoint,
						}
					: { data: data, requestId: requestId, timestamp: timestamp, endpoint: endpoint };
			}),
		);
	}
}
