import { injectable } from "tsyringe";
import { HealthRepository } from "./health.repository";

@injectable()
export class HealthService {
	constructor(private readonly _repository: HealthRepository) {}
	async check(): Promise<boolean> {
		const results = await Promise.allSettled([this._repository.readDatabase(), this._repository.readRedis()]);
		return results.every((result) => result.status === "fulfilled");
	}
}
