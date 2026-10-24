import { inject, injectable } from "tsyringe";
import type { AiWorkerEnv } from "../../cloudflare.config.ts";

export const AuthBinding = Symbol("AuthBinding");

@injectable()
export class AuthRepository {
	constructor(@inject(AuthBinding) private readonly _auth: AiWorkerEnv["AUTH"]) {}

	async resolveSession(params: { accessToken: string }): Promise<{ accountId: string } | null> {
		using session = await this._auth.resolveSession({ accessToken: params.accessToken });
		return session === null ? null : { accountId: session.accountId };
	}
}
