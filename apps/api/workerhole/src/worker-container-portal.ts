import { defineWorkerContainerPortal } from "@cataqui/workerhole";

export abstract class ApiWorkerContainerPortal extends defineWorkerContainerPortal<Record<never, never>>() {}
