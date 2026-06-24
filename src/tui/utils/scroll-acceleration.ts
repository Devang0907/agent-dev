import type { ScrollAcceleration } from "@opentui/core";

export class CustomSpeedScroll implements ScrollAcceleration {
  constructor(private speed: number) {}

  tick(_now?: number): number {
    return this.speed;
  }

  reset(): void {}
}

export function defaultScrollAcceleration(): ScrollAcceleration {
  return new CustomSpeedScroll(3);
}
