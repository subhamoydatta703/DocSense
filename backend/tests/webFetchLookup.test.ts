import { afterEach, expect, spyOn, test } from "bun:test";
import https from "node:https";
import type { ClientRequest, IncomingMessage } from "node:http";
import type { LookupOptions } from "node:dns";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { fetchPublicHtml } from "../src/utils/urlSecurity";

afterEach(() => { httpsRequestSpy?.mockRestore(); });
let httpsRequestSpy: ReturnType<typeof spyOn> | undefined;

/** Exercise the actual fetch service without DNS, TLS, or outbound requests. */
function simulateHttpsRequest(lookupOptions: LookupOptions, redirectTo?: string) {
  const lookupResults: Array<{ address: unknown; family?: number }> = [];
  const requestedHosts: string[] = [];
  const implementation = (options: https.RequestOptions, onResponse: (response: IncomingMessage) => void) => {
    requestedHosts.push(String(options.hostname));
    const request = Object.assign(new EventEmitter(), {
      setTimeout: () => request,
      destroy: (error?: Error) => { if (error) request.emit("error", error); return request; },
      end: () => {
        if (!options.lookup) throw new Error("The validated-IP lookup callback is missing.");
        options.lookup(String(options.hostname), lookupOptions, (error, address, family) => {
          if (error) throw error;
          // This is the array operation used by the networking layer that exposed
          // the original bug. A scalar response must fail before HTML is read.
          if (lookupOptions.all) {
            if (!Array.isArray(address)) throw new TypeError("DNS lookup must return an array when all is true.");
            address.sort((first, second) => second.family - first.family);
          }
          lookupResults.push({ address, family });
          const response = Object.assign(Readable.from([Buffer.from("<html><body>Readable source.</body></html>")]), {
            statusCode: redirectTo ? 302 : 200,
            headers: redirectTo ? { location: redirectTo } : { "content-type": "text/html" },
          });
          onResponse(response as IncomingMessage);
        });
      },
    });
    return request as unknown as ClientRequest;
  };
  httpsRequestSpy = spyOn(https, "request").mockImplementation(implementation as typeof https.request);
  return { lookupResults, requestedHosts };
}

for (const source of [
  { host: "1.1.1.1", address: "1.1.1.1", family: 4 },
  { host: "[2606:4700:4700::1111]", address: "2606:4700:4700::1111", family: 6 },
]) {
  for (const all of [true, false, undefined]) {
    test(`web fetch pins IPv${source.family} with DNS all=${String(all)}`, async () => {
      const { lookupResults, requestedHosts } = simulateHttpsRequest(all === undefined ? {} : { all });
      const result = await fetchPublicHtml(`https://${source.host}/article`);
      expect(result.html).toContain("Readable source.");
      expect(requestedHosts).toEqual([source.host]);
      expect(lookupResults).toEqual([all
        ? { address: [{ address: source.address, family: source.family }], family: undefined }
        : { address: source.address, family: source.family }]);
    });
  }
}

test("array-mode lookup does not allow redirects to private addresses", async () => {
  const { requestedHosts } = simulateHttpsRequest({ all: true }, "https://127.0.0.1/private");
  const error = await fetchPublicHtml("https://1.1.1.1/article").then(() => null, error => error);
  expect(error).toMatchObject({ status: 400 });
  expect(requestedHosts).toEqual(["1.1.1.1"]);
});
