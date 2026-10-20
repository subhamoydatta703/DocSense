import { expect, test } from "bun:test";
import { extractWebPageText } from "../src/utils/webPageText";

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
