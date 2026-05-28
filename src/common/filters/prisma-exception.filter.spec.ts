import { HttpStatus } from "@nestjs/common";
import { ErrorCode } from "../errors/error-code.enum";

vi.mock("../../../generated/prisma/client.js", () => {
	class PrismaClientKnownRequestError extends Error {
		code: string;
		clientVersion: string;
		meta?: unknown;
		constructor(message: string, options: { code: string; clientVersion: string; meta?: unknown }) {
			super(message);
			this.name = "PrismaClientKnownRequestError";
			this.code = options.code;
			this.clientVersion = options.clientVersion;
			this.meta = options.meta;
		}
	}

	return {
		Prisma: {
			PrismaClientKnownRequestError,
		},
	};
});

import { Prisma } from "../../../generated/prisma/client.js";
import { PrismaExceptionFilter } from "./prisma-exception.filter";

function createMockHost(code: string) {
	const statusMock = vi.fn();
	const sendMock = vi.fn();
	const response = { status: statusMock.mockReturnValue({ send: sendMock }) };
	const request = { method: "POST", url: "/api/v1/posts" };

	const host = {
		switchToHttp: () => ({
			getResponse: () => response,
			getRequest: () => request,
		}),
	};

	const exception = new Prisma.PrismaClientKnownRequestError("Prisma error", {
		code,
		clientVersion: "1.0.0",
	});

	const filter = new PrismaExceptionFilter();
	filter.catch(exception, host as never);

	return { statusMock, sendMock };
}

describe("PrismaExceptionFilter", () => {
	it("should map P2002 to 409 CONFLICT with VALIDATION_ERROR", () => {
		const { statusMock, sendMock } = createMockHost("P2002");

		expect(statusMock).toHaveBeenCalledWith(HttpStatus.CONFLICT);

		const body = sendMock.mock.calls[0]![0] as { errorCode: ErrorCode; message: string };
		expect(body.errorCode).toBe(ErrorCode.VALIDATION_ERROR);
		expect(body.message).toBe("The resource you are trying to create or update already exists.");
	});

	it("should map P2025 to 404 NOT_FOUND with NOT_FOUND", () => {
		const { statusMock, sendMock } = createMockHost("P2025");

		expect(statusMock).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);

		const body = sendMock.mock.calls[0]![0] as { errorCode: ErrorCode; message: string };
		expect(body.errorCode).toBe(ErrorCode.NOT_FOUND);
		expect(body.message).toBe("The requested record was not found or could not be accessed.");
	});

	it("should map P2003 to 400 BAD_REQUEST with VALIDATION_ERROR", () => {
		const { statusMock, sendMock } = createMockHost("P2003");

		expect(statusMock).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);

		const body = sendMock.mock.calls[0]![0] as { errorCode: ErrorCode; message: string };
		expect(body.errorCode).toBe(ErrorCode.VALIDATION_ERROR);
	});

	it("should handle unmapped Prisma error codes as 500 INTERNAL_SERVER_ERROR", () => {
		const { statusMock, sendMock } = createMockHost("P1001");

		expect(statusMock).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);

		const body = sendMock.mock.calls[0]![0] as { errorCode: ErrorCode; message: string };
		expect(body.errorCode).toBe(ErrorCode.INTERNAL_ERROR);
		expect(body.message).toBe("An unexpected database error occurred.");
	});
});
