import { AppError, AppErrorCode } from "../../src/errors/index";
import { ReferenceImportErrorCode } from "./references/reference-import-error-code.enum";
import { SourceImportErrorCode } from "./source-import-error-code.enum";
import { writeFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { parseArgs } from "node:util";
import { S3Client } from "@aws-sdk/client-s3";
import { ZodError } from "zod";
import { BasemapSourceCandidateSchema } from "../../src/tiles/sources/schemas/basemap-source-candidate.schema";
import { BasemapSourceReleaseSchema } from "../../src/tiles/sources/schemas/basemap-source-release.schema";
import { BasemapIndexManifestSchema } from "../../src/tiles/sources/indexes/schemas/basemap-index-manifest.schema";
import { getBasemapIndexFiles } from "../../src/tiles/sources/indexes/basemap-index-manifest";
import { MapshotCopyCheckpointSchema } from "./contracts/release/mapshot-copy-checkpoint.schema";
import { MapshotDeploymentStateSchema } from "./contracts/release/mapshot-deployment-state.schema";
import { MapshotDeploymentSchema } from "./contracts/release/mapshot-deployment.schema";
import { MapshotPreparationSchema } from "./contracts/release/mapshot-preparation.schema";
import { MapshotPromotionSchema } from "./contracts/release/mapshot-promotion.schema";
import { MapshotDataToolInputSchema } from "./contracts/release/mapshot-data-tool-input.schema";
import { BasemapPromotionAssetSchema } from "./contracts/promotion/basemap-promotion-asset.schema";
import { BasemapPromotionDescriptorSchema } from "./contracts/promotion/basemap-promotion-descriptor.schema";
import { BasemapPromotionManifestSchema } from "./contracts/promotion/basemap-promotion-manifest.schema";
import { BasemapPromotionManifestReferenceSchema } from "./contracts/promotion/basemap-promotion-manifest-reference.schema";
import {
	BasemapPromotionPageAssetLimit,
	BasemapPromotionPageSchema,
} from "./contracts/promotion/basemap-promotion-page.schema";
import { SourceImportJobSchema } from "./contracts/import/source-import-job.schema";
import { SourceImportCheckpointSchema } from "./contracts/import/source-import-checkpoint.schema";
import { SourceImportPhaseSchema } from "./contracts/import/source-import-phase.schema";
import { ProtomapsBuildsOutputSchema } from "./contracts/provider/protomaps-builds-output.schema";
import { ProtomapsSourceArchiveSchema } from "./contracts/provider/protomaps-source-archive.schema";
import { MapshotDataToolEnvironmentSchema } from "./contracts/provider/mapshot-data-tool-environment.schema";
import { MapshotDomainToolInputSchema } from "./contracts/mapshot-domain-tool-input.schema";
import { BasemapIndexExportService } from "./indexes/basemap-index-export.service";
import { ReferenceImportError } from "./references/reference-import.error";
import { R2ArchiveRangeRepository } from "./r2-archive-range.repository";
import { R2ArchiveRangeService } from "./r2-archive-range.service";
import { SourceImportError } from "./source-import.error";
import { VerifyArchiveService } from "./verify-archive.service";

// Required Node libraries own BLAKE3/PMTiles compute; Ruby owns storage and release transitions.
export async function evaluateMapshotDomainRequest(params: {
	input: unknown;
	environment: NodeJS.ProcessEnv;
}): Promise<unknown> {
	const input = MapshotDomainToolInputSchema.parse(params.input);
	switch (input.operation) {
		case "validate": {
			const contracts = {
				"deployment-state": MapshotDeploymentStateSchema,
				deployment: MapshotDeploymentSchema,
				preparation: MapshotPreparationSchema,
				promotion: MapshotPromotionSchema,
				"copy-checkpoint": MapshotCopyCheckpointSchema,
				source: BasemapSourceCandidateSchema,
				"source-release": BasemapSourceReleaseSchema,
				"promotion-manifest": BasemapPromotionManifestSchema,
				"promotion-page": BasemapPromotionPageSchema,
				"promotion-asset": BasemapPromotionAssetSchema,
				"promotion-descriptor": BasemapPromotionDescriptorSchema,
				"promotion-reference": BasemapPromotionManifestReferenceSchema,
				"index-manifest": BasemapIndexManifestSchema,
				"protomaps-builds": ProtomapsBuildsOutputSchema,
				"protomaps-archive": ProtomapsSourceArchiveSchema,
				"release-input": MapshotDataToolInputSchema,
				"import-job": SourceImportJobSchema,
				"import-checkpoint": SourceImportCheckpointSchema,
				"import-phase": SourceImportPhaseSchema,
			};
			if (!Object.hasOwn(contracts, input.kind))
				throw new SourceImportError({ code: SourceImportErrorCode.INVALID_INPUT });
			return contracts[input.kind as keyof typeof contracts].parse(input.value);
		}
		case "promotion.pageAssetLimit":
			return BasemapPromotionPageAssetLimit;
		case "index.files":
			return { manifest: input.manifest, files: getBasemapIndexFiles({ manifest: input.manifest }) };
		case "archive.verify": {
			return new VerifyArchiveService({
				archiveRangeService: _createArchiveRangeService({ environment: input.environment }),
			}).verifyAndExtractLandmarks({
				checkpoint: input.checkpoint,
				workDirectory: input.workDirectory,
				deadlineAt: input.deadlineAt,
			});
		}
		case "indexes.prepare": {
			return new BasemapIndexExportService({
				archiveRangeService: _createArchiveRangeService({ environment: input.environment }),
			}).export({
				release: input.release,
				landmarks: input.landmarks,
				workDirectory: input.workDirectory,
				deadlineAt: input.deadlineAt,
			});
		}
	}

	function _createArchiveRangeService(request: { environment: "staging" | "production" }): R2ArchiveRangeService {
		const credentials = MapshotDataToolEnvironmentSchema.parse({
			accountId: params.environment["CLOUDFLARE_ACCOUNT_ID"],
			accessKeyId: params.environment["MAPSHOT_R2_ACCESS_KEY_ID"],
			secretAccessKey: params.environment["MAPSHOT_R2_SECRET_ACCESS_KEY"],
		});
		return new R2ArchiveRangeService({
			repository: new R2ArchiveRangeRepository({
				bucket: `cataqui-mapshot-${request.environment}`,
				client: new S3Client({
					region: "auto",
					endpoint: `https://${credentials.accountId}.r2.cloudflarestorage.com`,
					credentials: { accessKeyId: credentials.accessKeyId, secretAccessKey: credentials.secretAccessKey },
					requestChecksumCalculation: "WHEN_REQUIRED",
					responseChecksumValidation: "WHEN_REQUIRED",
				}),
			}),
		});
	}
}

export async function runMapshotDomainCli(params: {
	args: string[];
	stdin: AsyncIterable<string | Buffer>;
	environment: NodeJS.ProcessEnv;
}): Promise<number> {
	let output: string | undefined;
	try {
		output = parseArgs({ args: params.args, options: { output: { type: "string" } } }).values.output;
		if (output === undefined || !isAbsolute(output))
			throw new SourceImportError({ code: SourceImportErrorCode.INVALID_INPUT });
		let input = "";
		for await (const chunk of params.stdin) input += chunk;
		const result = await evaluateMapshotDomainRequest({ input: JSON.parse(input), environment: params.environment });
		await writeFile(output, JSON.stringify(result), { flag: "wx", mode: 0o600 });
		return 0;
	} catch (error) {
		const storageCapacityExceeded = error instanceof Error && "code" in error && error.code === "ENOSPC";
		let failure: SourceImportError;
		if (error instanceof SourceImportError) failure = error;
		else if (error instanceof ZodError || error instanceof SyntaxError)
			failure = new SourceImportError({ code: SourceImportErrorCode.INVALID_INPUT });
		else if (error instanceof AppError && error.errorCode === AppErrorCode.BASEMAP_INDEX_INTEGRITY) {
			failure = new SourceImportError({ code: SourceImportErrorCode.INTEGRITY });
		} else if (error instanceof ReferenceImportError) {
			const codes = {
				[ReferenceImportErrorCode.INVALID_ARCHIVE]: SourceImportErrorCode.INTEGRITY,
				[ReferenceImportErrorCode.INTEGRITY]: SourceImportErrorCode.INTEGRITY,
				[ReferenceImportErrorCode.INCOMPLETE]: SourceImportErrorCode.INVALID_INPUT,
				[ReferenceImportErrorCode.CAPACITY]: SourceImportErrorCode.ATTEMPTS_EXHAUSTED,
				[ReferenceImportErrorCode.STAGING_CONFLICT]: SourceImportErrorCode.PREPARATION,
				[ReferenceImportErrorCode.CLOSED]: SourceImportErrorCode.PREPARATION,
				[ReferenceImportErrorCode.WORKER_EXITED]: SourceImportErrorCode.PREPARATION,
			} as const;
			failure = new SourceImportError({ code: codes[error.code] });
		} else if (storageCapacityExceeded) {
			// The release adapter presents this terminal resource failure as CAPACITY.
			failure = new SourceImportError({ code: SourceImportErrorCode.ATTEMPTS_EXHAUSTED });
		} else {
			failure = new SourceImportError({
				code:
					error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)
						? SourceImportErrorCode.ABORTED
						: SourceImportErrorCode.PREPARATION,
			});
		}
		if (output !== undefined && isAbsolute(output)) {
			await writeFile(output, JSON.stringify({ error: { code: failure.code, retryable: failure.retryable } }), {
				flag: "wx",
				mode: 0o600,
			}).catch(() => undefined);
		}
		console.error("Mapshot domain command failed; provider details were suppressed to protect credentials.");
		return 1;
	}
}

if (import.meta.main) {
	process.stdin.setEncoding("utf8");
	process.exitCode = await runMapshotDomainCli({
		args: process.argv.slice(2),
		stdin: process.stdin,
		environment: process.env,
	});
}
