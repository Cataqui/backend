export class UnregisteredScheduleError extends Error {
	constructor() {
		super("The scheduled Auth operation is not registered.");
		this.name = "UnregisteredScheduleError";
	}
}
