import { expect, test } from "bun:test";
import { assertUsableWebPage, extractWebPageText } from "../src/utils/webPageText";

test("JavaScript shells and access challenges are rejected before indexing", () => {
  for (const [content, title] of [["", "App"], ["You need to enable JavaScript to run this app.", "App"], ["Enable JavaScript and cookies to continue", "Just a moment..."]]) {
    expect(() => assertUsableWebPage(content!, title!)).toThrow();
  }
  expect(() => assertUsableWebPage("This article explains how to enable JavaScript in a browser.", "JavaScript guide")).not.toThrow();
});

test("compact HTML preserves headings, paragraphs and table rows", () => {
  const { content } = extractWebPageText('<article><h1>Return policy</h1><p>Returns accepted.</p><p>A receipt is required.</p><table><tr><th>Plan</th><th>Price</th></tr><tr><td>Basic</td><td>$10</td></tr></table></article>');
  expect(content).toContain("Return policy\n");
  expect(content).toContain("Returns accepted.\n");
  expect(content).toContain("A receipt is required.");
  expect(content).toContain("Plan | Price\n");
  expect(content).toContain("Basic | $10");
  expect(content).not.toContain("policyReturns");
});

test("article headers and substantive sidebars survive while site chrome is removed", () => {
  const { content, title } = extractWebPageText('<title>Policy</title><header>Site banner</header><nav>Menu</nav><main><article><header>Policy exceptions</header><aside>Special cases apply.</aside><p>Read the <strong>full</strong> policy.</p></article></main><footer>Site links</footer>');
  expect(title).toBe("Policy");
  expect(content).toContain("Policy exceptions");
  expect(content).toContain("Special cases apply.");
  expect(content).toContain("Read the full policy.");
  expect(content).not.toContain("Site banner");
  expect(content).not.toContain("Site links");
});

test("body fallback preserves lists and line breaks without indexing hidden or script content", () => {
  const { content } = extractWebPageText('<p>First<br>Second</p><ul><li>Alpha</li><li>Beta</li></ul><script>secret()</script><p hidden>Hidden text</p>');
  expect(content).toContain("First\nSecond");
  expect(content).toContain("Alpha\n");
  expect(content).toContain("Beta");
  expect(content).not.toContain("secret");
  expect(content).not.toContain("Hidden");
});

test("empty main placeholders do not hide readable article content", () => {
  const { content } = extractWebPageText('<main><div hidden>Loading</div></main><article><h1>Delivery</h1><p>Delivery takes three days.</p></article>');
  expect(content).toContain("Delivery takes three days.");
});

test("multiple main regions retain all visible source sections", () => {
  const { content } = extractWebPageText('<main><p>Standard delivery is free.</p></main><main><p>Express delivery costs $15.</p></main>');
  expect(content).toContain("Standard delivery is free.");
  expect(content).toContain("Express delivery costs $15.");
});
