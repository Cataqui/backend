import { Hono } from "hono";
import type { AiContext } from "../http/context";

export const healthRoutes = new Hono<AiContext>().get("/", (context) => context.body(null, 204));
