// Carrega prompts versionados (docs/AI_PIPELINE.md §5): `<name>.md` com front-matter
// `name`, `version`, `temperature`. O corpo vira o `system` do prompt.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import type { LoadedPrompt } from "../../../integrations/openai/client.js";

const DEFAULT_DIR = path.dirname(fileURLToPath(import.meta.url));

export function loadPrompt(name: string, dir: string = DEFAULT_DIR): LoadedPrompt {
  const file = path.join(dir, `${name}.md`);
  const { data, content } = matter(fs.readFileSync(file, "utf8"));
  if (data.name !== name) throw new Error(`${file}: front-matter name="${data.name}", esperado "${name}"`);
  if (typeof data.temperature !== "number") throw new Error(`${file}: front-matter sem temperature numérica`);
  // YAML lê `version: 1.0` como número 1; normaliza para "1.0".
  const v = data.version;
  if (v == null) throw new Error(`${file}: front-matter sem version`);
  const version = typeof v === "number" && Number.isInteger(v) ? v.toFixed(1) : String(v);
  const system = content.trim();
  if (!system) throw new Error(`${file}: prompt vazio`);
  return { name, version, system, temperature: data.temperature };
}

/** "extract@1.0" — gravado em meta.prompt_version. */
export const promptId = (p: LoadedPrompt): string => `${p.name}@${p.version}`;
