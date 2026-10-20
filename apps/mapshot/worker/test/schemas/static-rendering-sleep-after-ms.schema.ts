import { z } from "zod";

/** Omission keeps a started renderer warm; explicit milliseconds allow inactivity sleep. */
export const StaticRenderingSleepAfterMsSchema = z.int().positive().max(21_600_000).optional();
