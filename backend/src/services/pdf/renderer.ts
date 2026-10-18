import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import nunjucks from "nunjucks";
import type { ProposalContent } from "../../schemas/proposal.js";

// Renderizador de proposta — B9/B10. Nunjucks gera o HTML; Playwright (Node) converte
// em PDF. O Playwright é importado dinamicamente para não pesar o boot do servidor.

const templatesDir = fileURLToPath(new URL("../../templates/", import.meta.url));
const styles = readFileSync(`${templatesDir}styles.css`, "utf8");
const env = nunjucks.configure(templatesDir, { autoescape: true, noCache: true });

export function renderProposalHtml(content: ProposalContent): string {
  return env.render("proposal.njk", { content, styles });
}

export async function generatePdf(content: ProposalContent): Promise<Buffer> {
  const html = renderProposalHtml(content);
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    chromiumSandbox: false,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdf = await page.pdf({ format: "A4", printBackground: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
