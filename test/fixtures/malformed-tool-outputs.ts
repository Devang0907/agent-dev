export const GROQ_FUNCTION_TAG =
  '<function=bash,{"command":"echo hello"}</function>';

export const GROQ_PLAN_TAG =
  '<function=plan,{"action":"create","title":"Test","tasks":["step one"]}';

export const GPT_OSS_CHANNEL_LEAK = "browser<|channel|>commentary";

export const DUPLICATED_TOOL_NAME = "grepgrep";

export const VALIDATION_ERROR =
  'Tool call validation failed: attempted to call tool \'browser<|channel|>commentary\'';

export const FAILED_GENERATION =
  'failed_generation: <function=read,{"path":"src/main.ts"}';
