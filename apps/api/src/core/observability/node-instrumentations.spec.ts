import { execFile } from "node:child_process";
import { promisify } from "node:util";

const _NODE_INSTRUMENTATION_IMPORT_ARGUMENTS = [
	"--import",
	"./register-opentelemetry-instrumentation.mjs",
	"--import",
	"tsx",
] as const;
const _NODE_INSTRUMENTATION_FIXTURE_TIMEOUT_MILLISECONDS = 20_000;
const _NODE_INSTRUMENTATION_TEST_TIMEOUT_MILLISECONDS = 25_000;

describe("Node OpenTelemetry instrumentations", () => {
	it(
		"should send redacted structured Pino records through OpenTelemetry with trace correlation",
		async () => {
			const { stderr, stdout } = await promisify(execFile)(
				process.execPath,
				[..._NODE_INSTRUMENTATION_IMPORT_ARGUMENTS, "test/fixtures/opentelemetry-pino-log.fixture.ts"],
				{ cwd: process.cwd(), timeout: _NODE_INSTRUMENTATION_FIXTURE_TIMEOUT_MILLISECONDS },
			);
			const exportedLog = JSON.parse(
				stdout
					.trim()
					.split("\n")
					.find((line) => line.includes('"resourceAttributes"')) ?? "",
			) as {
				attributes: Record<string, unknown>;
				body: unknown;
				resourceAttributes: Record<string, unknown>;
				severityText: string;
				spanContext: { spanId: string; traceId: string };
			};

			expect({
				exportedLog: exportedLog,
				leaksPrivateToken: JSON.stringify(exportedLog).includes("private-token-value"),
				loaderWarnings: ["ExperimentalWarning", "import-in-the-middle"].filter((warning) => stderr.includes(warning)),
			}).toEqual({
				exportedLog: expect.objectContaining({
					attributes: {
						context: "Fixture",
						event: "api.fixture.completed",
						statusCode: 200,
					},
					body: "api.fixture.completed",
					resourceAttributes: {
						"deployment.environment.name": "development",
						"service.name": "cataqui-api",
						"service.version": "0123456789abcdef0123456789abcdef01234567",
					},
					severityText: "info",
					spanContext: expect.objectContaining({
						spanId: expect.stringMatching(/^[0-9a-f]{16}$/),
						traceId: expect.stringMatching(/^[0-9a-f]{32}$/),
					}),
				}),
				leaksPrivateToken: false,
				loaderWarnings: [],
			});
		},
		_NODE_INSTRUMENTATION_TEST_TIMEOUT_MILLISECONDS,
	);

	it(
		"should instrument a real HTTP server before imports and export only the normalized privacy-safe route",
		async () => {
			const { stdout } = await promisify(execFile)(
				process.execPath,
				[..._NODE_INSTRUMENTATION_IMPORT_ARGUMENTS, "test/fixtures/opentelemetry-http-server.fixture.ts"],
				{ cwd: process.cwd(), timeout: _NODE_INSTRUMENTATION_FIXTURE_TIMEOUT_MILLISECONDS },
			);
			const exportedSpan = JSON.parse(stdout.trim().split("\n").at(-1) ?? "") as {
				allSpanAttributes: Record<string, unknown>[];
				attributes: Record<string, unknown>;
				name: string;
			};

			const privateTopLevelAttributeNames = [
				"client.address",
				"network.peer.address",
				"network.local.address",
				"network.local.port",
				"server.address",
				"server.port",
				"url.full",
				"url.path",
				"url.query",
				"user_agent.original",
			].filter((attributeName) => Object.hasOwn(exportedSpan.attributes, attributeName));
			const privateInstrumentedAttributeNames = exportedSpan.allSpanAttributes
				.flatMap((attributes) => Object.keys(attributes))
				.filter(
					(attributeName) =>
						attributeName === "http.request.method_original" ||
						/^peer(?:\[\d+\])?\.ipv[46]$/.test(attributeName) ||
						/^network\.local\.(?:address|port)$/.test(attributeName) ||
						/^dns\.error_(?:message|name)$/.test(attributeName),
				);

			expect({
				exportedSpan: exportedSpan,
				leaksPrivateCursor: JSON.stringify(exportedSpan).includes("private-cursor"),
				privateAttributeNames: [...privateTopLevelAttributeNames, ...privateInstrumentedAttributeNames],
			}).toEqual({
				exportedSpan: expect.objectContaining({
					attributes: expect.objectContaining({
						"cataqui.request.id": "mobile-request-123",
						"http.route": "/v1/jobs/:jobId",
					}),
					name: "GET /v1/jobs/:jobId",
				}),
				leaksPrivateCursor: false,
				privateAttributeNames: [],
			});
		},
		_NODE_INSTRUMENTATION_TEST_TIMEOUT_MILLISECONDS,
	);

	it(
		"should export an aborted server request without a fabricated successful response",
		async () => {
			const { stdout } = await promisify(execFile)(
				process.execPath,
				[..._NODE_INSTRUMENTATION_IMPORT_ARGUMENTS, "test/fixtures/opentelemetry-http-abort.fixture.ts"],
				{ cwd: process.cwd(), timeout: _NODE_INSTRUMENTATION_FIXTURE_TIMEOUT_MILLISECONDS },
			);
			const exportedSpan = JSON.parse(stdout.trim().split("\n").at(-1) ?? "") as {
				attributes: Record<string, unknown>;
				name: string;
				status: { code: number };
			};

			expect({
				exportedSpan: exportedSpan,
				hasResponseStatus: Object.hasOwn(exportedSpan.attributes, "http.response.status_code"),
			}).toEqual({
				exportedSpan: {
					attributes: expect.objectContaining({
						"cataqui.http.outcome": "ABORTED",
						"http.route": "/v1/feed",
					}),
					name: "GET /v1/feed",
					status: { code: 0 },
				},
				hasResponseStatus: false,
			});
		},
		_NODE_INSTRUMENTATION_TEST_TIMEOUT_MILLISECONDS,
	);
});
