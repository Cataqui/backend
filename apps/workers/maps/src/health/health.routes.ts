import { Hono } from "hono";
import type { MapsContext } from "../http/context";
import { checkHealthDocs } from "./health.openapi";
export const healthRoutes = new Hono<MapsContext>().get("/", checkHealthDocs, (context) => context.body(null, 204));
