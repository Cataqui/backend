import type { PaginationOutput } from "@cataqui/response";

const PAGINATED_RESULT = Symbol("paginated_result");

export type PaginatedResult<T> = {
	readonly [PAGINATED_RESULT]: true;
	readonly data: T[];
	readonly pagination: PaginationOutput;
};

function create<T>(params: { data: T[]; pagination: PaginationOutput }): PaginatedResult<T> {
	return {
		[PAGINATED_RESULT]: true,
		data: params.data,
		pagination: params.pagination,
	};
}

function is(value: unknown): value is PaginatedResult<unknown> {
	return typeof value === "object" && value !== null && PAGINATED_RESULT in value;
}

export const PaginatedResult = {
	create: create,
	is: is,
} as const;
