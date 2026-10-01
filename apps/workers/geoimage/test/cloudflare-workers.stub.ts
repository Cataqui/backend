// Node unit tests exercise orchestration; Workers runtime integration tests use the real base class.
export class DurableObject<Environment> {
	constructor(
		_state: DurableObjectState,
		readonly env: Environment,
	) {}
}
