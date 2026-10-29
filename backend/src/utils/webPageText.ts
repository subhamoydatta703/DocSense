import * as cheerio from "cheerio";
import { ServiceError } from "../errors/serviceError";
import { hasReadableText } from "./sourceText";

/** Reject empty app shells and obvious access challenges before marking them as sources. */
export function assertUsableWebPage(content: string, title: string): void {
  const text = content.replace(/\s+/g, " ").trim();
  const scriptShell = /^(?:(?:please |you need to )?enable javascript(?: to (?:run|view|use) (?:this )?(?:app|page|website))?[.!]?|loading[.!\s]*)$/i.test(text);
  if (!hasReadableText(text) || scriptShell) {
    throw new ServiceError(422, "This page has no readable article text or requires JavaScript. Upload its text or a PDF version instead.", "source_fetch");
  }
  if (/^(?:just a moment[.!\s]*|attention required.*cloudflare|access denied)$/i.test(title.trim()) &&
      /(?:verify (?:you are|you're|that you are) human|checking your browser|enable javascript and cookies|access denied)/i.test(text)) {
    throw new ServiceError(422, "This website returned an access challenge instead of its article. Upload the page text instead.", "source_fetch");
  }
}

/** Preserve readable structure before extracting text; whitespace cannot repair merged words later. */
export function extractWebPageText(html: string): { content: string; title: string } {
  const page = cheerio.load(html);
  const title = page("title").text().trim();
  page('script, style, noscript, iframe, nav, [role="navigation"], [role="banner"], [hidden], [aria-hidden="true"]').remove();
  page("body > header, body > footer").remove();

  let contentRoot = page('main, [role="main"]');
  if (!contentRoot.text().trim()) contentRoot = page("article");
  if (!contentRoot.text().trim()) contentRoot = page("body");

  contentRoot.find("br").replaceWith("\n");
  contentRoot.find("td, th").each((_index, cell) => {
    if (page(cell).next("td, th").length) page(cell).append(" | ");
  });
  const blockElements = "h1, h2, h3, h4, h5, h6, p, li, div, section, article, header, aside, blockquote, pre, tr";
  contentRoot.find(blockElements).prepend("\n").append("\n");
  contentRoot.prepend("\n").append("\n");
  const content = contentRoot.text()
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .split("\n")
    .map(line => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { content, title };
}
