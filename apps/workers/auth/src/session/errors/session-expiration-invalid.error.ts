export class SessionExpirationInvalidError extends RangeError {
	constructor() {
		super("session.expiresAt must be in the future");
		this.name = new.target.name;
	}
}
