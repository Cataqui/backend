import { ContainerShutdownFailedError } from "./container-shutdown-failed.error";
import { ContainerRuntimeFailedError } from "./container-runtime-failed.error";
import { ContainerUnavailableError } from "./container-unavailable.error";
import { ContainerReadinessFailedError } from "./container-readiness-failed.error";
import { ContainerOperationTimedOutError } from "./container-operation-timed-out.error";
import { RenderingUnavailableError } from "./rendering-unavailable.error";
import { RenderValidationError } from "./render-validation.error";
import { R2ObjectNotFoundError } from "./r2-object-not-found.error";
import { R2ObjectRevisionMismatchError } from "./r2-object-revision-mismatch.error";
import { R2ObjectRangeMismatchError } from "./r2-object-range-mismatch.error";
import { R2ObjectReadFailedError } from "./r2-object-read-failed.error";
import { R2ObjectReadAbortedError } from "./r2-object-read-aborted.error";
import { MapshotWorkerError } from "./mapshot-worker.error";

it.each([
	{
		error: new ContainerShutdownFailedError(),
		name: "ContainerShutdownFailedError",
		code: "CONTAINER_SHUTDOWN_FAILED",
		message: "Mapshot container shutdown failed.",
	},
	{
		error: new ContainerRuntimeFailedError(),
		name: "ContainerRuntimeFailedError",
		code: "CONTAINER_RUNTIME_FAILED",
		message: "Mapshot container runtime failed.",
	},
	{
		error: new ContainerUnavailableError(),
		name: "ContainerUnavailableError",
		code: "CONTAINER_UNAVAILABLE",
		message: "Mapshot container is unavailable.",
	},
	{
		error: new ContainerReadinessFailedError({ message: "Native Container not ready" }),
		name: "ContainerReadinessFailedError",
		code: "CONTAINER_READINESS_FAILED",
		message: "Native Container not ready",
	},
	{
		error: new ContainerOperationTimedOutError(),
		name: "ContainerOperationTimedOutError",
		code: "CONTAINER_OPERATION_TIMED_OUT",
		message: "Mapshot container operation timed out.",
	},
	{
		error: new RenderingUnavailableError(),
		name: "RenderingUnavailableError",
		code: "RENDERING_UNAVAILABLE",
		message: "",
	},
	{
		error: new RenderValidationError({ violations: [{ path: ["size", "width"], message: "Must be positive." }] }),
		name: "RenderValidationError",
		code: "VALIDATION_ERROR",
		message: '{"violations":[{"path":["size","width"],"message":"Must be positive."}]}',
	},
	{
		error: new R2ObjectNotFoundError(),
		name: "R2ObjectNotFoundError",
		code: "R2_OBJECT_NOT_FOUND",
		message: "The requested R2 object was not found.",
	},
	{
		error: new R2ObjectRevisionMismatchError(),
		name: "R2ObjectRevisionMismatchError",
		code: "R2_OBJECT_REVISION_MISMATCH",
		message: "The R2 object's ETag does not match the requested revision.",
	},
	{
		error: new R2ObjectRangeMismatchError(),
		name: "R2ObjectRangeMismatchError",
		code: "R2_OBJECT_RANGE_MISMATCH",
		message: "The R2 response range length is missing or does not match the requested byte count.",
	},
	{
		error: new R2ObjectReadFailedError(),
		name: "R2ObjectReadFailedError",
		code: "R2_OBJECT_READ_FAILED",
		message: "The R2 provider failed to read the requested object byte range.",
	},
	{
		error: new R2ObjectReadAbortedError(),
		name: "R2ObjectReadAbortedError",
		code: "R2_OBJECT_READ_ABORTED",
		message: "The R2 object byte range read was aborted.",
	},
])("keeps $name in the Worker error hierarchy with its owned code and message", ({ error, name, code, message }) => {
	expect(error).toBeInstanceOf(Error);
	expect(error).toBeInstanceOf(MapshotWorkerError);
	expect(error.name).toBe(name);
	expect(error.errorCode).toBe(code);
	expect(error.message).toBe(message);
});
