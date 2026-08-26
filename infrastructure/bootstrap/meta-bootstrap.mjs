import { knownSecrets, promptHidden } from "./bootstrap-runtime.mjs";
import { getInfisicalSecret, setInfisicalSecret } from "./infisical-bootstrap.mjs";
import { reconcileMetaAppSecretState } from "./meta-reconciliation.mjs";
import { ENVIRONMENTS } from "./reconciliation.mjs";

const metaRuntimeSecretPath = "/generated/webhooks/runtime";

export async function reconcileMetaAppSecret(infisicalProjectId, infisicalToken) {
	const storedByEnvironment = {};
	for (const environment of ENVIRONMENTS) {
		storedByEnvironment[environment] = await getInfisicalSecret({
			projectId: infisicalProjectId,
			token: infisicalToken,
			environment,
			secretPath: metaRuntimeSecretPath,
			name: "META_APP_SECRET",
		});
		if (storedByEnvironment[environment]) knownSecrets.add(storedByEnvironment[environment]);
	}
	return reconcileMetaAppSecretState({
		storedByEnvironment,
		requestSecret: () =>
			promptHidden({
				message: "Meta app secret: ",
				unavailableMessage: "META_APP_SECRET is missing; rerun bootstrap from an interactive terminal.",
			}),
		writeSecret: (environment, value) =>
			setInfisicalSecret({
				projectId: infisicalProjectId,
				token: infisicalToken,
				environment,
				secretPath: metaRuntimeSecretPath,
				name: "META_APP_SECRET",
				value,
			}),
	});
}
