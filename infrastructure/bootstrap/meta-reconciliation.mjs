import { ENVIRONMENTS } from "./reconciliation.mjs";

export function decideMetaAppSecret(storedByEnvironment) {
	const distinct = [...new Set(Object.values(storedByEnvironment).filter(Boolean))];
	if (distinct.length > 1) throw new Error("Staging and production contain conflicting Meta app secrets.");
	if (distinct.length === 0) return { action: "prompt" };
	const value = distinct[0];
	const missingEnvironments = ENVIRONMENTS.filter((environment) => !storedByEnvironment[environment]);
	return { action: missingEnvironments.length === 0 ? "reuse" : "repair", value, missingEnvironments };
}

export async function reconcileMetaAppSecretState({ storedByEnvironment, requestSecret, writeSecret }) {
	const decision = decideMetaAppSecret(storedByEnvironment);
	if (decision.action === "reuse") return decision.value;
	const value = decision.action === "prompt" ? await requestSecret() : decision.value;
	if (typeof value !== "string" || value.length === 0) throw new Error("The Meta app secret cannot be empty.");
	const targets = decision.action === "repair" ? decision.missingEnvironments : ENVIRONMENTS;
	for (const environment of targets) await writeSecret(environment, value);
	return value;
}
