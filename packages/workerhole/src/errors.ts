export class ConnectionClosedError extends Error {
	constructor() {
		super("Workerhole connection is closed.");
		this.name = "ConnectionClosedError";
	}
}

export class ConnectionFailedError extends Error {
	constructor(options?: ErrorOptions) {
		super("Workerhole connection could not be established.", options);
		this.name = "ConnectionFailedError";
	}
}

export class PortalUnavailableError extends ConnectionFailedError {
	constructor() {
		super();
		this.name = "PortalUnavailableError";
	}
}

export class RemoteError extends Error {
	readonly errorCode: string | undefined;
	readonly remoteName: string;

	constructor(params: { name: string; message: string; errorCode?: string | undefined }) {
		super(params.message);
		this.name = "RemoteError";
		this.remoteName = params.name;
		this.errorCode = params.errorCode;
	}
}
