import { injectable } from "tsyringe";
import { AuthRepository } from "./auth.repository";

@injectable()
export class AuthService {
	private readonly _repository: AuthRepository;

	constructor(repository: AuthRepository) {
		this._repository = repository;
	}

	async getAuthenticatedAccountIdOrNull(params: { accessToken: string }): Promise<string | null> {
		const session = await this._repository.resolveSession({ accessToken: params.accessToken });
		return session?.accountId ?? null;
	}
}
