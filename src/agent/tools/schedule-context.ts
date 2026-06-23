export interface ScheduleContext {
  chatId: number;
  userId?: number;
}

let activeScheduleContext: ScheduleContext | null = null;

export function setScheduleContext(ctx: ScheduleContext | null): void {
  activeScheduleContext = ctx;
}

export function getScheduleContext(): ScheduleContext | null {
  return activeScheduleContext;
}
