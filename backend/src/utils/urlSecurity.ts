import { lookup } from "node:dns/promises";
import https from "node:https";
import { z } from "zod";
import ipaddr from "ipaddr.js";

const MAX_REDIRECTS = 3;
const MAX_WEB_RESPONSE_BYTES = 2 * 1024 * 1024;
const WEB_REQUEST_TIMEOUT_MS = 10_000;

export const CreateWebUrlSchema = z.object({
  url: z.url("Invalid URL").refine((url) => new URL(url).protocol === "https:", {
    message: "Only HTTPS URLs are allowed",
  }),
});

type PublicAddress = { address: string; family: 4 | 6 };

function isPublicAddress(address: string): boolean {
  try {
    return ipaddr.parse(address).range() === "unicast";
  } catch {
    return false;
  }
}

async function resolvePublicAddress(hostname: string): Promise<PublicAddress> {
  if (ipaddr.isValid(hostname)) {
    if (!isPublicAddress(hostname)) {
      throw new Error("The provided URL resolves to a non-public address.");
    }
    return { address: hostname, family: ipaddr.parse(hostname).kind() === "ipv6" ? 6 : 4 };
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  const publicAddress = addresses.find((entry) => isPublicAddress(entry.address));
  if (!publicAddress) {
    throw new Error("The provided URL does not resolve to a public address.");
  }
  return { address: publicAddress.address, family: publicAddress.family as 4 | 6 };
}

export async function assertPublicHttpsUrl(value: string): Promise<URL> {
  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error("Only HTTPS URLs are allowed.");
  }
  if (url.username || url.password) {
    throw new Error("URLs with embedded credentials are not allowed.");
  }
  await resolvePublicAddress(url.hostname);
  return url;
}

async function requestPublicHtml(url: URL): Promise<{ statusCode: number; location?: string; body: string }> {
  const resolved = await resolvePublicAddress(url.hostname);

  return new Promise((resolve, reject) => {
    const request = https.request({
      protocol: "https:",
      hostname: url.hostname,
      port: url.port || 443,
      path: `${url.pathname}${url.search}`,
      method: "GET",
      headers: {
        "User-Agent": "DocSense/1.0 (+https://docsense.app)",
        Accept: "text/html,application/xhtml+xml",
      },
      servername: url.hostname,
      lookup: (_hostname, _options, callback) => {
        callback(null, resolved.address, resolved.family);
      },
    }, (response) => {
      const statusCode = response.statusCode ?? 500;
      const location = typeof response.headers.location === "string"
        ? response.headers.location
        : undefined;

      if (statusCode >= 300 && statusCode < 400) {
        response.resume();
        resolve({ statusCode, location, body: "" });
        return;
      }

      const contentType = response.headers["content-type"] || "";
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
        response.resume();
        reject(new Error("The URL did not return an HTML document."));
        return;
      }

      const chunks: Buffer[] = [];
      let receivedBytes = 0;
      response.on("data", (chunk: Buffer) => {
        receivedBytes += chunk.length;
        if (receivedBytes > MAX_WEB_RESPONSE_BYTES) {
          request.destroy(new Error("The web page exceeds the 2MB content limit."));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => resolve({
        statusCode,
        location,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
      response.on("error", reject);
    });

    request.setTimeout(WEB_REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error("The web request timed out."));
    });
    request.on("error", reject);
    request.end();
  });
}

export async function fetchPublicHtml(initialUrl: string): Promise<{ html: string; finalUrl: URL }> {
  let url = await assertPublicHttpsUrl(initialUrl);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    const response = await requestPublicHtml(url);
    if (response.statusCode >= 300 && response.statusCode < 400) {
      if (!response.location) {
        throw new Error("The web page returned an invalid redirect.");
      }
      if (redirectCount === MAX_REDIRECTS) {
        throw new Error("The web page redirected too many times.");
      }
      url = await assertPublicHttpsUrl(new URL(response.location, url).toString());
      continue;
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`Failed to fetch URL: HTTP ${response.statusCode}`);
    }
    return { html: response.body, finalUrl: url };
  }

  throw new Error("Unable to fetch the requested web page.");
}
