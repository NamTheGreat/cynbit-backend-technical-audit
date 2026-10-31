import dns from "node:dns/promises";
import net from "node:net";

const ALLOWED_HTTPS_PORT = new Set(["", "443"]);

/**
 * Checks whether an IP address belongs to private, loopback, link-local,
 * or cloud metadata CIDRs. Remediates API-01 (SSRF defense).
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
      return true;
    }
    const [a, b] = parts;
    return (
      a === 0 || // 0.0.0.0/8
      a === 10 || // 10.0.0.0/8 (RFC 1918)
      a === 127 || // 127.0.0.0/8 (Loopback)
      (a === 169 && b === 254) || // 169.254.0.0/16 (Link-local / AWS IMDS)
      (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12 (RFC 1918)
      (a === 192 && b === 168) || // 192.168.0.0/16 (RFC 1918)
      (a === 100 && b >= 64 && b <= 127) // 100.64.0.0/10 (Carrier-Grade NAT)
    );
  }

  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    return (
      normalized === "::1" ||
      normalized === "::" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:") ||
      normalized.startsWith("::ffff:127.") ||
      normalized.startsWith("::ffff:169.254.") ||
      normalized.startsWith("::ffff:10.") ||
      normalized.startsWith("::ffff:192.168.")
    );
  }

  return true;
}

export interface ValidatedExternalUrl {
  canonicalUrl: string;
  hostname: string;
  resolvedIps: string[];
}

/**
 * Asserts that a candidate-supplied deliverable URL is syntactically valid,
 * strictly HTTPS, uses standard ports without embedded credentials,
 * resolves to public non-reserved IP addresses, and does not point to
 * cloud metadata endpoints or internal VPC hosts.
 */
export async function assertSafeExternalUrl(rawUrl: string): Promise<ValidatedExternalUrl> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL syntax: ${rawUrl}`);
  }

  if (parsed.protocol !== "https:") {
    throw new Error(`Only HTTPS deliverable links are permitted (rejected scheme: ${parsed.protocol})`);
  }

  if (parsed.username || parsed.password) {
    throw new Error("Deliverable URLs must not contain embedded user credentials");
  }

  if (!ALLOWED_HTTPS_PORT.has(parsed.port)) {
    throw new Error(`Deliverable URLs must use standard HTTPS port 443 (rejected port: ${parsed.port})`);
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".localhost")
  ) {
    throw new Error(`Disallowed internal hostname: ${hostname}`);
  }

  // If hostname is directly an IP literal
  if (net.isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) {
      throw new Error(`Security violation: Hostname literal is a restricted private IP (${hostname})`);
    }
    return { canonicalUrl: parsed.toString(), hostname, resolvedIps: [hostname] };
  }

  const addresses = await dns.lookup(hostname, { all: true });
  if (addresses.length === 0) {
    throw new Error(`Unable to resolve hostname: ${hostname}`);
  }

  const resolvedIps: string[] = [];
  for (const addr of addresses) {
    resolvedIps.push(addr.address);
    if (isPrivateOrReservedIp(addr.address)) {
      throw new Error(`Security violation: Hostname '${hostname}' resolves to restricted internal IP (${addr.address})`);
    }
  }

  return { canonicalUrl: parsed.toString(), hostname, resolvedIps };
}
