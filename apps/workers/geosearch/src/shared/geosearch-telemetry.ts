export enum GeosearchProviderOperation {
	ADDRESS_DETAILS = "ADDRESS_DETAILS",
	ADDRESS_SEARCH = "ADDRESS_SEARCH",
}

export enum GeosearchProviderFailureReason {
	PROVIDER_RESPONSE_INVALID = "PROVIDER_RESPONSE_INVALID",
	PROVIDER_RESPONSE_REJECTED = "PROVIDER_RESPONSE_REJECTED",
	TRANSPORT_UNAVAILABLE = "TRANSPORT_UNAVAILABLE",
}

export type GeosearchTelemetryContext = {
	environment: GeosearchWorkerEnv["ENVIRONMENT"];
	requestId: string;
	version: string;
};

export function getGeosearchServiceName(params: { environment: GeosearchWorkerEnv["ENVIRONMENT"] }): string {
	return `cataqui-geosearch-${params.environment}`;
}
