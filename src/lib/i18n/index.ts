import { en } from "./en";

export type MessageKey = keyof typeof en;

export type MessageVars = Record<string, string | number>;

export function format(template: string, vars?: MessageVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(vars, name) ? String(vars[name]) : placeholder,
  );
}

export function t(key: MessageKey, vars?: MessageVars): string {
  return format(en[key], vars);
}
