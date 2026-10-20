import { Reflector } from "@nestjs/core";

export const Public = Reflector.createDecorator<void, boolean>({ transform: (): boolean => true });
