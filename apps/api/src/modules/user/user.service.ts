import { Injectable } from "@nestjs/common";
import type { z } from "zod";
import { UserRepository } from "./repositories/user.repository";
import type { CurrentUserOutputSchema } from "./schemas/current-user-output.schema";

@Injectable()
export class UserService {
	constructor(private readonly _userRepository: UserRepository) {}

	async getCurrentUser(params: {
		sessionId: string;
		userId: string;
	}): Promise<z.infer<typeof CurrentUserOutputSchema>> {
		return this._userRepository.findCurrentUserForSession({
			sessionId: params.sessionId,
			userId: params.userId,
		});
	}
}
