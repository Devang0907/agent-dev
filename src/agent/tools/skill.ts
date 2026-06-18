import type { ToolDefinition } from "../../providers/types.js";
import {
  formatSkillToolOutput,
  getSkillContext,
  requireSkill,
} from "../skills.js";

export const skillTool: ToolDefinition = {
  name: "skill",
  description:
    "Load a skill by name from available_skills. Use when a task matches a skill description.",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "The name of the skill from available_skills",
      },
    },
    required: ["name"],
    additionalProperties: false,
  },
};

export async function executeSkill(args: { name: string }): Promise<string> {
  const { workdir, settings } = getSkillContext();
  const skill = requireSkill(args.name.trim(), workdir, settings);
  return formatSkillToolOutput(skill);
}

export function formatSkillPermissionCommand(args: { name: string }): string {
  return `skill ${args.name}`;
}
