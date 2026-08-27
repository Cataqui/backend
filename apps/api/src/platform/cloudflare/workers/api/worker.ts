import { ContainerProxy, getRandom } from "@cloudflare/containers";
import {
	apiContainerInboundManifest,
	type ApiContainerInboundCall,
	type ApiContainerInboundReceiver,
	type IApiContainerInboundWorker,
} from "@cataqui/api-internal-ingress";
import { routeQueueBatch } from "@cataqui/api-internal-ingress/queue";
import { routeInboundCall } from "@cataqui/api-internal-ingress/router";
import {
	getSourceSafeErrorTelemetryFields,
	getTelemetryHttpRequestMethod,
	getWorkerVersion,
	ObservabilityEventConstants,
} from "@cataqui/observability-contracts";
import { WorkerEntrypoint } from "cloudflare:workers";
import { ApiContainer } from "../../containers/api/api-container";

export { ApiContainer, ContainerProxy };

const _REQUEST_ID_HEADER_NAME = "x-request-id";

function _createHeadersWithGeneratedRequestId(params: { headers?: HeadersInit | undefined }): {
	headers: Headers;
	requestId: string;
} {
	const headers = new Headers(params.headers);
	const requestId = crypto.randomUUID();

	headers.delete("baggage");
	headers.delete("traceparent");
	headers.delete("tracestate");
	headers.set(_REQUEST_ID_HEADER_NAME, requestId);

	return { headers: headers, requestId: requestId };
}

function _createResponseWithRequestId(params: { requestId: string; response: Response }): Response {
	const responseHeaders = new Headers(params.response.headers);
	responseHeaders.set(_REQUEST_ID_HEADER_NAME, params.requestId);

	return new Response(params.response.body, {
		headers: responseHeaders,
		status: params.response.status,
		statusText: params.response.statusText,
	});
}

function _writeLogForHttpResponseStatus(params: { fields: Record<string, unknown>; responseStatus: number }): void {
	if (params.responseStatus >= 500) {
		console.error(params.fields);
		return;
	}

	if (params.responseStatus >= 400) {
		console.warn(params.fields);
		return;
	}

	console.log(params.fields);
}

export class ApiContainerInboundEntrypoint
	extends WorkerEntrypoint<ApiWorkerEnv>
	implements IApiContainerInboundWorker
{
	async deliverInbound<Receiver extends ApiContainerInboundReceiver>(
		params: ApiContainerInboundCall<Receiver>,
	): Promise<Response> {
		const inboundCallStartedAt = performance.now();
		const requestHeaders = _createHeadersWithGeneratedRequestId({});
		const telemetryReceiver = Object.hasOwn(apiContainerInboundManifest, params.receiver)
			? params.receiver
			: "UNMATCHED";
		const workerServiceName = `cataqui-api-${this.env.NODE_ENV}`;
		const workerServiceVersion = getWorkerVersion({ metadata: this.env.WORKER_VERSION_METADATA });

		try {
			const containerResponse = await routeInboundCall({
				receiver: params.receiver,
				body: params.body,
				deliver: async ({ url, requestOptions }) => {
					const container = await getRandom(this.env.API_CONTAINER, Number(this.env.API_CONTAINER_POOL_SIZE));
					const deliveryHeaders = new Headers(requestOptions.headers);
					deliveryHeaders.delete("baggage");
					deliveryHeaders.delete("traceparent");
					deliveryHeaders.delete("tracestate");
					deliveryHeaders.set(_REQUEST_ID_HEADER_NAME, requestHeaders.requestId);
					return container.containerFetch(url, {
						...requestOptions,
						headers: deliveryHeaders,
					});
				},
			});
			const response = _createResponseWithRequestId({
				requestId: requestHeaders.requestId,
				response: containerResponse,
			});

			_writeLogForHttpResponseStatus({
				fields: {
					durationMilliseconds: performance.now() - inboundCallStartedAt,
					env: this.env.NODE_ENV,
					event: response.ok
						? ObservabilityEventConstants.API_WORKER_INBOUND_CALL_COMPLETED_EVENT
						: ObservabilityEventConstants.API_WORKER_INBOUND_CALL_REJECTED_EVENT,
					outcome: response.ok ? "SUCCESS" : "REJECTED",
					receiver: telemetryReceiver,
					requestId: requestHeaders.requestId,
					responseStatus: response.status,
					service: workerServiceName,
					version: workerServiceVersion,
				},
				responseStatus: response.status,
			});

			return response;
		} catch (error) {
			console.error({
				durationMilliseconds: performance.now() - inboundCallStartedAt,
				env: this.env.NODE_ENV,
				...getSourceSafeErrorTelemetryFields({ error: error }),
				event: ObservabilityEventConstants.API_WORKER_INBOUND_CALL_FAILED_EVENT,
				outcome: "THREW",
				receiver: telemetryReceiver,
				requestId: requestHeaders.requestId,
				service: workerServiceName,
				version: workerServiceVersion,
			});
			throw error;
		}
	}
}

export class MicroservicesAuthJwksEntrypoint extends WorkerEntrypoint<ApiWorkerEnv> {
	override async fetch(request: Request): Promise<Response> {
		const container = await getRandom(this.env.API_CONTAINER, Number(this.env.API_CONTAINER_POOL_SIZE));
		const response = await container.fetch(request);
		if (response.status === 200) return response;

		const uncachedResponse = new Response(response.body, response);
		uncachedResponse.headers.set("Cache-Control", "no-store");
		return uncachedResponse;
	}
}

const worker = {
	async fetch(request: Request, environment: ApiWorkerEnv, context: ExecutionContext): Promise<Response> {
		const requestStartedAt = performance.now();
		const requestHeaders = _createHeadersWithGeneratedRequestId({ headers: request.headers });
		const requestMethod = getTelemetryHttpRequestMethod({ requestMethod: request.method });
		const workerServiceName = `cataqui-api-${environment.NODE_ENV}`;
		const workerServiceVersion = getWorkerVersion({ metadata: environment.WORKER_VERSION_METADATA });

		try {
			const correlatedRequest = new Request(request, { headers: requestHeaders.headers });
			const containerResponse =
				request.method === "GET" && new URL(request.url).pathname === "/v1/auth/microservices/jwks"
					? await context.exports.MicroservicesAuthJwksEntrypoint.fetch(correlatedRequest)
					: await (await getRandom(environment.API_CONTAINER, Number(environment.API_CONTAINER_POOL_SIZE))).fetch(
							correlatedRequest,
						);
			const response = _createResponseWithRequestId({
				requestId: requestHeaders.requestId,
				response: containerResponse,
			});

			_writeLogForHttpResponseStatus({
				fields: {
					durationMilliseconds: performance.now() - requestStartedAt,
					env: environment.NODE_ENV,
					event:
						response.status >= 500
							? ObservabilityEventConstants.API_WORKER_REQUEST_REJECTED_EVENT
							: ObservabilityEventConstants.API_WORKER_REQUEST_COMPLETED_EVENT,
					method: requestMethod,
					outcome: response.status >= 500 ? "REJECTED" : response.status >= 400 ? "CLIENT_REJECTED" : "SUCCESS",
					requestId: requestHeaders.requestId,
					responseStatus: response.status,
					service: workerServiceName,
					version: workerServiceVersion,
				},
				responseStatus: response.status,
			});

			return response;
		} catch (error) {
			console.error({
				durationMilliseconds: performance.now() - requestStartedAt,
				env: environment.NODE_ENV,
				...getSourceSafeErrorTelemetryFields({ error: error }),
				event: ObservabilityEventConstants.API_WORKER_REQUEST_FAILED_EVENT,
				method: requestMethod,
				outcome: "THREW",
				requestId: requestHeaders.requestId,
				responseStatus: 500,
				service: workerServiceName,
				version: workerServiceVersion,
			});
			throw error;
		}
	},

	async queue(batch: MessageBatch<unknown>, environment: ApiWorkerEnv): Promise<void> {
		const batchStartedAt = performance.now();
		const workerServiceName = `cataqui-api-${environment.NODE_ENV}`;
		const workerServiceVersion = getWorkerVersion({ metadata: environment.WORKER_VERSION_METADATA });

		try {
			const batchResult = await routeQueueBatch({
				batch: batch,
				environment: environment.NODE_ENV,
				deliver: async ({ url, requestOptions }) => {
					const deliveryStartedAt = performance.now();
					const requestHeaders = _createHeadersWithGeneratedRequestId({ headers: requestOptions.headers });

					try {
						const container = await getRandom(environment.API_CONTAINER, Number(environment.API_CONTAINER_POOL_SIZE));
						const response = await container.containerFetch(url, {
							...requestOptions,
							headers: requestHeaders.headers,
						});

						_writeLogForHttpResponseStatus({
							fields: {
								durationMilliseconds: performance.now() - deliveryStartedAt,
								env: environment.NODE_ENV,
								event: response.ok
									? ObservabilityEventConstants.API_WORKER_QUEUE_DELIVERY_COMPLETED_EVENT
									: ObservabilityEventConstants.API_WORKER_QUEUE_DELIVERY_REJECTED_EVENT,
								outcome: response.ok ? "SUCCESS" : "REJECTED",
								queue: batch.queue,
								requestId: requestHeaders.requestId,
								responseStatus: response.status,
								service: workerServiceName,
								version: workerServiceVersion,
							},
							responseStatus: response.status,
						});

						return response;
					} catch (error) {
						console.error({
							durationMilliseconds: performance.now() - deliveryStartedAt,
							env: environment.NODE_ENV,
							...getSourceSafeErrorTelemetryFields({ error: error }),
							event: ObservabilityEventConstants.API_WORKER_QUEUE_DELIVERY_FAILED_EVENT,
							outcome: "THREW",
							queue: batch.queue,
							requestId: requestHeaders.requestId,
							service: workerServiceName,
							version: workerServiceVersion,
						});
						throw error;
					}
				},
			});

			const batchLogFields = {
				acknowledgedMessageCount: batchResult.acknowledgedMessageCount,
				durationMilliseconds: performance.now() - batchStartedAt,
				env: environment.NODE_ENV,
				event: ObservabilityEventConstants.API_WORKER_QUEUE_BATCH_COMPLETED_EVENT,
				invalidMessageCount: batchResult.invalidMessageCount,
				messageCount: batch.messages.length,
				outcome: batchResult.retriedMessageCount === 0 ? "SUCCESS" : "RETRY_SCHEDULED",
				queue: batch.queue,
				retriedMessageCount: batchResult.retriedMessageCount,
				service: workerServiceName,
				version: workerServiceVersion,
			};
			if (batchResult.retriedMessageCount === 0) console.log(batchLogFields);
			else console.warn(batchLogFields);
		} catch (error) {
			console.error({
				durationMilliseconds: performance.now() - batchStartedAt,
				env: environment.NODE_ENV,
				...getSourceSafeErrorTelemetryFields({ error: error }),
				event: ObservabilityEventConstants.API_WORKER_QUEUE_BATCH_FAILED_EVENT,
				messageCount: batch.messages.length,
				outcome: "THREW",
				queue: batch.queue,
				service: workerServiceName,
				version: workerServiceVersion,
			});
			throw error;
		}
	},
} satisfies ExportedHandler<ApiWorkerEnv>;

export default worker;
