import { Controller, Get, type INestApplication, UseGuards } from "@nestjs/common";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import type { IAuthenticatedSession } from "../interfaces/authenticated-session.interface";
import { CurrentAuthSession } from "./current-auth-session.decorator";

class TestAuthGuard {
	canActivate(context: { switchToHttp: () => { getRequest: () => Record<string, unknown> } }): boolean {
		context.switchToHttp().getRequest()["authSession"] = {
			sessionId: "session-id",
			userId: "user-id",
			expiresAt: new Date("2026-09-04T15:00:00.000Z"),
		};
		return true;
	}
}

@Controller("decorator-test")
class CurrentAuthSessionDecoratorTestController {
	@Get()
	@UseGuards(TestAuthGuard)
	get(@CurrentAuthSession() session: IAuthenticatedSession): { sessionId: string; userId: string } {
		return { sessionId: session.sessionId, userId: session.userId };
	}
}

describe("CurrentAuthSession", () => {
	it("should provide the session attached by the authentication guard", async () => {
		const module = await Test.createTestingModule({
			controllers: [CurrentAuthSessionDecoratorTestController],
			providers: [TestAuthGuard],
		}).compile();
		const app: INestApplication = module.createNestApplication(new FastifyAdapter());
		await app.init();

		const response = await app.getHttpAdapter().getInstance().inject({ method: "GET", url: "/decorator-test" });
		await app.close();

		expect(response.json()).toEqual({ sessionId: "session-id", userId: "user-id" });
	});
});
