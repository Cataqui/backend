import { z } from "zod";

export const GetStaticMapLocationUrlOutputSchema = z.strictObject({
	url: z.union([
		z.url({ protocol: /^https$/ }),
		z.url({ protocol: /^http$/, hostname: /^(?:localhost|127\.0\.0\.1|\[::1\])$/ }),
	]),
});

export type GetStaticMapLocationUrlOutput = z.output<typeof GetStaticMapLocationUrlOutputSchema>;
