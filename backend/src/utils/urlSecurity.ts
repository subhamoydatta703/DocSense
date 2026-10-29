import { lookup } from "node:dns/promises";
import https from "node:https";
import { z } from "zod";
import ipaddr from "ipaddr.js";
import { ServiceError } from "../errors/serviceError";
import { abortable, withDeadline } from "./deadline";
import { readHtmlResponse } from "./webResponse";

const MAX_REDIRECTS = 5;
const WEB_REQUEST_TIMEOUT_MS = 15_000;
const WEB_FETCH_TIMEOUT_MS = 45_000;

export const CreateWebUrlSchema = z.object({
  url: z.url("Invalid URL").refine((url) => new URL(url).protocol === "https:", {
    message: "Only HTTPS URLs are allowed",
  }),
});

type PublicAddress = { address: string; family: 4 | 6 };

/**
 * Checks if an IP address is a public unicast IP address.
 */
function isPublicAddress(address: string): boolean {
  try {
    return ipaddr.parse(address).range() === "unicast";
  } catch {
    return false;
  }
}

/**
 * Resolves domain hostname to public IP address to prevent SSRF vulnerabilities.
 */
async function resolvePublicAddresses(hostname: string): Promise<PublicAddress[]> {
  hostname = hostname.replace(/^\[|\]$/g, "");
  if (ipaddr.isValid(hostname)) {
    if (!isPublicAddress(hostname)) {
      throw new ServiceError(400, "The provided URL resolves to a non-public address.");
    }
    return [{ address: hostname, family: ipaddr.parse(hostname).kind() === "ipv6" ? 6 : 4 }];
  }

  const addresses = await withDeadline(lookup(hostname, { all: true, verbatim: true }), 5_000, "Domain lookup timed out.")
    .catch(() => { throw new ServiceError(422, "The source domain could not be resolved. Please check the URL."); });
  const publicAddresses = addresses.filter((entry) => isPublicAddress(entry.address));
  if (!publicAddresses.length) {
    throw new ServiceError(400, "The provided URL does not resolve to a public address.");
  }
  // Prefer IPv4 on hosts without working IPv6, while retaining all validated
  // addresses for the networking layer's automatic connection fallback.
  return publicAddresses.map(entry => ({ address: entry.address, family: entry.family as 4 | 6 }))
    .sort((first, second) => first.family - second.family);
}

/**
 * Validates that a string is a public HTTPS URL with no embedded credentials or private IPs.
 */
function parseHttpsUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); }
  catch { throw new ServiceError(400, "Please provide a valid HTTPS URL."); }
  if (url.protocol !== "https:") {
    throw new ServiceError(400, "Only HTTPS URLs are allowed.");
  }
  if (url.username || url.password) {
    throw new ServiceError(400, "URLs with embedded credentials are not allowed.");
  }
  return url;
}

export async function assertPublicHttpsUrl(value: string): Promise<URL> {
  const url = parseHttpsUrl(value);
  await resolvePublicAddresses(url.hostname);
  return url;
}

/**
 * Executes a secure HTTPS GET request to fetch HTML content within size and timeout limits.
 */
async function requestPublicHtml(url: URL, signal: AbortSignal): Promise<{ statusCode: number; location?: string; body: string }> {
  const addresses = await abortable(resolvePublicAddresses(url.hostname), signal);
  const resolved = addresses[0]!;
  const hostname = url.hostname.replace(/^\[|\]$/g, "");

  return new Promise((resolve, reject) => {
    const requestOptions: https.RequestOptions & { autoSelectFamily: boolean } = {
      protocol: "https:",
      hostname,
      port: url.port || 443,
      path: `${url.pathname}${url.search}`,
      method: "GET",
      signal: AbortSignal.any([signal, AbortSignal.timeout(WEB_REQUEST_TIMEOUT_MS)]),
      autoSelectFamily: true,
      headers: {
        "User-Agent": "DocSense/1.0 (+https://docsense.app)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Encoding": "gzip, deflate, br",
      },
      servername: ipaddr.isValid(hostname) ? undefined : hostname,
      lookup: (_hostname, options, callback) => {
        // Every returned address has already passed the public-IP check.
        if (options.all) {
          callback(null, addresses);
          return;
        }
        callback(null, resolved.address, resolved.family);
      },
    };
    const request = https.request(requestOptions, (response) => {
      const statusCode = response.statusCode ?? 500;
      const location = typeof response.headers.location === "string"
        ? response.headers.location
        : undefined;

      if (statusCode < 200 || statusCode >= 300) {
        response.destroy();
        resolve({ statusCode, location, body: "" });
        return;
      }

      void readHtmlResponse(response).then(body => resolve({ statusCode, location, body }), reject);
    });

    request.setTimeout(WEB_REQUEST_TIMEOUT_MS, () => {
      request.destroy(new DOMException("The web request timed out.", "TimeoutError"));
    });
    request.on("error", reject);
    request.end();
  });
}

/**
 * Fetches public HTML with a total deadline and a public-IP check on every hop.
 */
export async function fetchPublicHtml(initialUrl: string): Promise<{ html: string; finalUrl: URL }> {
  let url = parseHttpsUrl(initialUrl);
  const signal = AbortSignal.timeout(WEB_FETCH_TIMEOUT_MS);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    let response: Awaited<ReturnType<typeof requestPublicHtml>>;
    try {
      response = await requestPublicHtml(url, signal);
      if ([502, 503, 504].includes(response.statusCode)) response = await requestPublicHtml(url, signal);
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      const timedOut = signal.aborted || (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name));
      throw new ServiceError(timedOut ? 504 : 502, timedOut
        ? "The website took too long to respond. Please try again or upload its text."
        : "Could not connect securely to this website. Please try again or upload its text.", "source_fetch", { cause: error });
    }
    if (response.statusCode >= 300 && response.statusCode < 400) {
      if (!response.location) {
        throw new ServiceError(422, "The website returned a redirect without a destination.", "source_fetch");
      }
      if (redirectCount === MAX_REDIRECTS) {
        throw new ServiceError(422, "The website redirected too many times. Use its final page URL.", "source_fetch");
      }
      try { url = parseHttpsUrl(new URL(response.location, url).toString()); }
      catch (error) {
        if (error instanceof ServiceError) throw error;
        throw new ServiceError(422, "The website returned an invalid redirect URL.", "source_fetch");
      }
      continue;
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      const message = [401, 403].includes(response.statusCode)
        ? "This website requires sign-in or blocks automated access. Upload the page text instead."
        : response.statusCode === 404 ? "This web page was not found. Please check the URL."
          : response.statusCode === 429 ? "This website is limiting requests. Please try again later."
            : `The website returned HTTP ${response.statusCode}. Please try again later or upload its text.`;
      throw new ServiceError(response.statusCode === 429 ? 429 : response.statusCode >= 500 ? 502 : 422, message, "source_fetch");
    }
    return { html: response.body, finalUrl: url };
  }

  throw new Error("Unable to fetch the requested web page.");
}
