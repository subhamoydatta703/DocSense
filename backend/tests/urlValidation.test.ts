import { expect, test } from "bun:test";
import { assertPublicHttpsUrl } from "../src/utils/urlSecurity";

test("invalid protocols and embedded credentials are rejected before network access", async () => {
  for (const url of ["not a URL", "http://example.com", "https://user:password@example.com"]) {
    const error = await assertPublicHttpsUrl(url).then(() => null, error => error);
    expect(error).toMatchObject({ status: 400 });
  }
});
test("private IPv4 and bracketed IPv6 addresses are rejected locally", async () => {
  for (const url of ["https://127.0.0.1", "https://10.0.0.1", "https://[::1]"]) {
    const error = await assertPublicHttpsUrl(url).then(() => null, error => error);
    expect(error).toMatchObject({ status: 400 });
  }
});
