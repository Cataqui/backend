import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Observable } from "rxjs";
import { tap } from "rxjs";
import { RequestUtils } from "../../shared/utils/request.utils";

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
	private readonly _logger = new Logger("HTTP");

	intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
		const request = context.switchToHttp().getRequest<FastifyRequest>();
		const method = request.method;
		const endpoint = RequestUtils.resolveEndpoint(request);
		const start = Date.now();

		return next.handle().pipe(
			tap(() => {
				const response = context.switchToHttp().getResponse<FastifyReply>();
				const duration = Date.now() - start;
				this._logger.log(`${method} ${endpoint} ${response.statusCode} ${duration}ms`);
			}),
		);
	}
}
