export class ApiContainerUnavailableError extends Error {
	constructor() {
		super("API container is unavailable.");
		this.name = "ApiContainerUnavailableError";
	}
}

export class ApiContainerStartupTimedOutError extends Error {
	constructor() {
		super("API container startup timed out.");
		this.name = "ApiContainerStartupTimedOutError";
	}
}
