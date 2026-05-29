import { SetMetadata } from "@nestjs/common";

export const SKIP_ENVELOPE_KEY = "skip_envelope";

export const SkipEnvelope = () => SetMetadata(SKIP_ENVELOPE_KEY, true);
