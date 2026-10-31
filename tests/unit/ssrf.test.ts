import { describe, it, expect } from "vitest";
import { isPrivateOrReservedIp, assertSafeExternalUrl } from "@/lib/security/ssrf";

describe("SSRF Defense and Private CIDR Filtering (Remediates API-01)", () => {
  it("flags private, loopback, and cloud metadata IPv4 addresses", () => {
    // Loopback
    expect(isPrivateOrReservedIp("127.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("127.1.2.3")).toBe(true);

    // AWS / Cloud Metadata (IMDS)
    expect(isPrivateOrReservedIp("169.254.169.254")).toBe(true);
    expect(isPrivateOrReservedIp("169.254.1.1")).toBe(true);

    // RFC 1918 Class A
    expect(isPrivateOrReservedIp("10.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("10.255.255.255")).toBe(true);

    // RFC 1918 Class B
    expect(isPrivateOrReservedIp("172.16.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("172.31.255.255")).toBe(true);
    expect(isPrivateOrReservedIp("172.32.0.1")).toBe(false); // Public

    // RFC 1918 Class C
    expect(isPrivateOrReservedIp("192.168.1.1")).toBe(true);

    // CGNAT
    expect(isPrivateOrReservedIp("100.64.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("100.127.255.255")).toBe(true);

    // Public Internet IP
    expect(isPrivateOrReservedIp("8.8.8.8")).toBe(false);
    expect(isPrivateOrReservedIp("1.1.1.1")).toBe(false);
  });

  it("flags IPv6 loopback, unique local, and mapped addresses", () => {
    expect(isPrivateOrReservedIp("::1")).toBe(true);
    expect(isPrivateOrReservedIp("fc00::1")).toBe(true);
    expect(isPrivateOrReservedIp("fd12:3456::1")).toBe(true);
    expect(isPrivateOrReservedIp("fe80::1")).toBe(true);
    expect(isPrivateOrReservedIp("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("::ffff:169.254.169.254")).toBe(true);
  });

  it("rejects non-HTTPS URLs", async () => {
    await expect(assertSafeExternalUrl("http://github.com/cynbit")).rejects.toThrow(
      "Only HTTPS deliverable links are permitted"
    );
    await expect(assertSafeExternalUrl("ftp://files.cynbit.in/task.zip")).rejects.toThrow(
      "Only HTTPS deliverable links are permitted"
    );
    await expect(assertSafeExternalUrl("javascript:alert(1)")).rejects.toThrow(
      "Only HTTPS deliverable links are permitted"
    );
  });

  it("rejects URLs with embedded credentials or non-standard ports", async () => {
    await expect(assertSafeExternalUrl("https://admin:secret@github.com/repo")).rejects.toThrow(
      "embedded user credentials"
    );
    await expect(assertSafeExternalUrl("https://github.com:8080/repo")).rejects.toThrow(
      "standard HTTPS port 443"
    );
  });

  it("rejects internal and local hostnames", async () => {
    await expect(assertSafeExternalUrl("https://localhost/repo")).rejects.toThrow("Disallowed internal hostname");
    await expect(assertSafeExternalUrl("https://internal.service.local/repo")).rejects.toThrow(
      "Disallowed internal hostname"
    );
  });

  it("rejects IP literals targeting private subnets or cloud metadata", async () => {
    await expect(assertSafeExternalUrl("https://169.254.169.254/latest/meta-data/")).rejects.toThrow(
      "restricted private IP"
    );
    await expect(assertSafeExternalUrl("https://127.0.0.1:443/admin")).rejects.toThrow(
      "restricted private IP"
    );
    await expect(assertSafeExternalUrl("https://10.0.1.50/dashboard")).rejects.toThrow(
      "restricted private IP"
    );
  });
});
