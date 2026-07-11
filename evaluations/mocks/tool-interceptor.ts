export type ToolExecuteHook = (
  name: string,
  args: Record<string, unknown>,
  execute: () => Promise<string>,
) => Promise<string>;

export interface ToolInterceptorRule {
  tool: string;
  match?: (args: Record<string, unknown>) => boolean;
  failCount?: number;
  errorMessage?: string;
}

export function createToolInterceptor(rules: ToolInterceptorRule[]): ToolExecuteHook {
  const counters = new Map<string, number>();

  return async (name, args, execute) => {
    for (const rule of rules) {
      if (rule.tool !== name) continue;
      if (rule.match && !rule.match(args)) continue;

      const key = `${name}:${JSON.stringify(args)}`;
      const count = (counters.get(key) ?? 0) + 1;
      counters.set(key, count);

      const failUntil = rule.failCount ?? 1;
      if (count <= failUntil) {
        return rule.errorMessage ?? `Error: simulated ${name} failure (attempt ${count})`;
      }
    }
    return execute();
  };
}
