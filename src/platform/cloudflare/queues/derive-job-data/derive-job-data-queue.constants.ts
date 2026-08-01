const BASE_NAME = "cataqui-api-derive-job-data";
const OUTBOUND_HOST = "derive-job-data.queue";
const INTERNAL_ROUTE = "derive-data";

export const DeriveJobDataQueueConstants = {
	BASE_NAME,
	OUTBOUND_HOST,
	INTERNAL_ROUTE,
} as const;
