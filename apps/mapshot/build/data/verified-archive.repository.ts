import { rename } from "node:fs/promises";

export class VerifiedArchiveRepository {
	moveLandmarks(params: { from: string; to: string }): Promise<void> {
		return rename(params.from, params.to);
	}
}
