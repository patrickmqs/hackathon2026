import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const dir = path.resolve(import.meta.dirname, "../../sample_data");
const read = (f: string) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));

const historical = z.object({
  is_demo: z.literal(true),
  projects: z
    .array(
      z.object({
        name: z.string().min(1),
        tags: z.array(z.string()).min(1),
        modules: z
          .array(
            z.object({
              name: z.string().min(1),
              complexity: z.enum(["S", "M", "L", "XL"]),
              hours_actual: z.number().positive(),
            }),
          )
          .min(1),
        team_size: z.number().int().positive(),
        weeks: z.number().positive(),
      }),
    )
    .min(8)
    .max(12),
});

const rate = z.number().positive();
const vendor = z.object({
  is_demo_profile: z.literal(true),
  name: z.string().min(1),
  contact: z.object({ name: z.string(), email: z.string().email(), phone: z.string() }),
  site: z.string().url(),
  hourly_rates: z.object({
    currency: z.literal("BRL"),
    backend_dev: rate,
    frontend_dev: rate,
    qa: rate,
    ux: rate,
    pm: rate,
    devops: rate,
  }),
});

describe("sample_data: projetos históricos e perfil do fornecedor", () => {
  it("historical_projects.json é válido (10 projetos)", () => {
    const d = historical.parse(read("historical_projects.json"));
    expect(d.projects).toHaveLength(10);
  });

  it("vendor_profile.json é válido", () => {
    vendor.parse(read("vendor_profile.json"));
  });
});
