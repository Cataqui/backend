import { ENVIRONMENTS } from "./reconciliation.mjs";

export function decideMetaAppSecret(storedByEnvironment) {
	const missingEnvironments = ENVIRONMENTS.filter((environment) => !storedByEnvironment[environment]);
	if (missingEnvironments.length > 0) return { action: "prompt", environments: missingEnvironments };
	if (storedByEnvironment.staging === storedByEnvironment.production) {
		return { action: "replace-shared", environments: ENVIRONMENTS };
	}
	return { action: "reuse", environments: [] };
}

export async function reconcileMetaAppSecretState({ storedByEnvironment, requestSecret, writeSecret }) {
	const decision = decideMetaAppSecret(storedByEnvironment);
	for (const environment of decision.environments) {
		const value = await requestSecret(environment);
		if (typeof value !== "string" || value.length === 0) {
			throw new Error(`The ${environment} Meta app secret cannot be empty.`);
		}
		await writeSecret(environment, value);
	}
	return decision;
}
