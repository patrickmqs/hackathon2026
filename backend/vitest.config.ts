import { defineConfig, type Plugin } from "vitest/config";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

// NodeNext/ESM usa imports com extensão ".js" apontando para fontes ".ts".
// O Vitest não faz esse mapeamento por padrão; este plugin resolve "./x.js" -> "./x.ts".
const resolveJsAsTs: Plugin = {
  name: "resolve-js-as-ts",
  enforce: "pre",
  resolveId(source: string, importer: string | undefined) {
    if (importer && source.startsWith(".") && source.endsWith(".js")) {
      const candidate = resolve(dirname(importer), source.slice(0, -3) + ".ts");
      if (existsSync(candidate)) {
        return candidate;
      }
    }
    return null;
  },
};

export default defineConfig({
  plugins: [resolveJsAsTs],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
