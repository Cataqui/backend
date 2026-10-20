import { Reflector } from "@nestjs/core";

export const ProfileRequired = Reflector.createDecorator<void, boolean>({ transform: (): boolean => true });
