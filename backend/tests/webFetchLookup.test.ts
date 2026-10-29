import { afterEach, expect, spyOn, test } from "bun:test";
import https from "node:https";
import type { ClientRequest, IncomingMessage } from "node:http";
import type { LookupOptions } from "node:dns";
import * as dns from "node:dns/promises";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { fetchPublicHtml } from "../src/utils/urlSecurity";

afterEach(() => { httpsRequestSpy?.mockRestore(); });
let httpsRequestSpy: ReturnType<typeof spyOn> | undefined;

/** Exercise the actual fetch service without DNS, TLS, or outbound requests. */
function simulateHttpsRequest(lookupOptions: LookupOptions, redirectTo?: string, statuses: number[] = []) {
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
            statusCode: statuses.shift() ?? (redirectTo ? 302 : 200),
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
      expect(requestedHosts).toEqual([source.address]);
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

test("family fallback receives every public address and no private DNS answers", async () => {
  const lookupSpy = spyOn(dns, "lookup").mockImplementation((async () => [
    { address: "2606:4700:4700::1111", family: 6 }, { address: "127.0.0.1", family: 4 },
    { address: "1.1.1.1", family: 4 }, { address: "8.8.8.8", family: 4 },
  ]) as unknown as typeof dns.lookup);
  try {
    const { lookupResults } = simulateHttpsRequest({ all: true });
    await fetchPublicHtml("https://articles.example/source");
    expect(lookupResults[0]!.address).toEqual(expect.arrayContaining([
      { address: "1.1.1.1", family: 4 }, { address: "8.8.8.8", family: 4 }, { address: "2606:4700:4700::1111", family: 6 },
    ]));
    expect(lookupResults[0]!.address).toHaveLength(3);
  } finally { lookupSpy.mockRestore(); }
});

test("transient website errors retry once, but access blocks and rate limits do not", async () => {
  let simulation = simulateHttpsRequest({ all: true }, undefined, [503, 200]);
  expect((await fetchPublicHtml("https://1.1.1.1/article")).html).toContain("Readable source");
  expect(simulation.requestedHosts).toHaveLength(2);
  for (const [upstreamStatus, expectedStatus, message] of [[403, 422, "blocks automated access"], [404, 422, "not found"], [429, 429, "limiting requests"]] as const) {
    httpsRequestSpy?.mockRestore();
    simulation = simulateHttpsRequest({ all: true }, undefined, [upstreamStatus]);
    const error = await fetchPublicHtml("https://1.1.1.1/article").then(() => null, error => error);
    expect(error).toMatchObject({ status: expectedStatus, stage: "source_fetch" });
    expect(error.message).toContain(message);
    expect(simulation.requestedHosts).toHaveLength(1);
  }
});
