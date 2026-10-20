import * as cheerio from "cheerio";

/** Preserve readable structure before extracting text; whitespace cannot repair merged words later. */
export function extractWebPageText(html: string): { content: string; title: string } {
  const page = cheerio.load(html);
  const title = page("title").text().trim();
  page('script, style, noscript, iframe, nav, [role="navigation"], [role="banner"], [hidden], [aria-hidden="true"]').remove();
  page("body > header, body > footer").remove();

  let contentRoot = page('main, [role="main"]').first();
  if (!contentRoot.length) contentRoot = page("article");
  if (!contentRoot.length) contentRoot = page("body");

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
