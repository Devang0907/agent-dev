import type { SkillNameOption } from "./slash-commands.js";
import { SLASH_COMMANDS } from "./slash-commands.js";

export interface CommandEntry {
  id: string;
  title: string;
  category: string;
  slash?: string;
  run: () => void;
}

export function buildCommandRegistry(opts: {
  onSlash: (cmd: string) => void;
  onPaletteAction: (id: string) => void;
  skills: SkillNameOption[];
}): CommandEntry[] {
  const slashEntries: CommandEntry[] = SLASH_COMMANDS.map((c) => ({
    id: c.cmd,
    title: c.desc,
    category: "Commands",
    slash: c.cmd,
    run: () => opts.onSlash(c.cmd),
  }));

  const nav: CommandEntry[] = [
    {
      id: "scroll-latest",
      title: "Scroll to latest output",
      category: "Navigation",
      run: () => opts.onPaletteAction("scroll-latest"),
    },
    {
      id: "interrupt",
      title: "Interrupt running agent",
      category: "Navigation",
      run: () => opts.onPaletteAction("interrupt"),
    },
  ];

  return [...slashEntries, ...nav];
}

export function fuzzyFilter(entries: CommandEntry[], query: string): CommandEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter(
    (e) =>
      e.title.toLowerCase().includes(q) ||
      e.id.toLowerCase().includes(q) ||
      (e.slash?.toLowerCase().includes(q) ?? false),
  );
}
