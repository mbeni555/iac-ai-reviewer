import { describe, expect, it } from "vitest";

import { redact } from "./redact";

describe("redact", () => {
  it("redacts assignment-style secrets and AWS access key ids", () => {
    const input = [
      'api_key = "AKIAIOSFODNN7EXAMPLE"',
      "password: 'hunter2'",
      "aws_secret_access_key = \"wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY\"",
      "Authorization: Bearer abcdef.token-value",
      "ghp_abcdefghijklmnopqrstuvwxyz123456",
      "xoxb-1234567890-abcdefghij",
    ].join("\n");
    const output = redact(input);
    expect(output).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(output).not.toContain("hunter2");
    expect(output).not.toContain("wJalrXUtnFEMI");
    expect(output).not.toContain("abcdef.token-value");
    expect(output).not.toContain("ghp_");
    expect(output).not.toContain("xoxb-");
    expect(output).toContain("[REDACTED]");
  });

  it("redacts a private key block", () => {
    const pem = [
      "-----BEGIN RSA PRIVATE KEY-----",
      "MIIEowIBAAKCAQEA7example",
      "-----END RSA PRIVATE KEY-----",
    ].join("\n");
    expect(redact(pem)).toBe("[REDACTED_PRIVATE_KEY]");
  });

  it("leaves ordinary prose alone", () => {
    const text = "Service account tokens should not be mounted, and this token word is fine.";
    expect(redact(text)).toBe(text);
  });
});
