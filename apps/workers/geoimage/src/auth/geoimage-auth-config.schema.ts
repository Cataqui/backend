import { z } from "zod";

export const GeoimageAuthConfigSchema = z.strictObject({
	jwksUrl: z.url({ protocol: /^https?$/ }),
});
