import { injectable } from "tsyringe";
import { AuthRepository } from "./auth.repository";
import { AuthUnavailableError } from "./errors/auth-unavailable.error";
import { UnauthenticatedError } from "./errors/unauthenticated.error";

@injectable()
export class AuthService {
	constructor(private readonly _repository: AuthRepository) {}

	async authenticate(params: { accessToken: string }): Promise<string> {
		const session = await this._repository.resolveSession({ accessToken: params.accessToken }).catch(() => {
			throw new AuthUnavailableError();
		});

		if (session === null) throw new UnauthenticatedError();
		return session.accountId;
	}
}
