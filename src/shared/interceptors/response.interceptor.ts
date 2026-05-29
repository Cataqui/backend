import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from "@nestjs/common";
import type { Observable } from "rxjs";
import { map } from "rxjs";
import { instanceToPlain } from "class-transformer";
import type { FastifyRequest } from "fastify";
import { RequestUtils } from "../utils/request.utils";
import { SuccessResponseDto } from "../dto/success-response.dto";
import { PaginatedSuccessResponseDto } from "../dto/paginated-success-response.dto";
import { PaginatedResponseDto } from "../dto/paginated-response.dto";
import { SKIP_ENVELOPE_KEY } from "../decorators/skip-envelope.decorator";

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
	intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
		const skipEnvelope = (Reflect.getOwnMetadata(SKIP_ENVELOPE_KEY, context.getHandler()) ?? Reflect.getMetadata(SKIP_ENVELOPE_KEY, context.getClass())) as boolean | undefined;

		if (skipEnvelope) {
			return next.handle().pipe(
				map((data: unknown) => {
					if (data === null || data === undefined) return data;
					return instanceToPlain(data, { exposeUnsetFields: false });
				}),
			);
		}

		const request = context.switchToHttp().getRequest<FastifyRequest>();
		const requestId = RequestUtils.resolveRequestId(request);
		const timestamp = new Date().toISOString();
		const endpoint = RequestUtils.resolveEndpoint(request);

		return next.handle().pipe(
			map((data: unknown) => {
				if (data === null || data === undefined) return data;

				const responseDto =
					data instanceof PaginatedResponseDto
						? new PaginatedSuccessResponseDto(data.data, data.pagination, requestId, timestamp, endpoint)
						: new SuccessResponseDto(data, requestId, timestamp, endpoint);

				return instanceToPlain(responseDto, { exposeUnsetFields: false });
			}),
		);
	}
}
