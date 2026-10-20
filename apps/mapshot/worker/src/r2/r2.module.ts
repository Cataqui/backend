import { R2Repository } from "./r2.repository";
import { R2Service } from "./r2.service";

export function createR2Service(params: { bucket: R2Bucket }): R2Service {
	return new R2Service({ repository: new R2Repository(params.bucket) });
}
