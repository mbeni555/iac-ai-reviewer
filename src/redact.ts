interface RedactionRule {
  source: string;
  flags: string;
  replace: string;
}

const RULES: readonly RedactionRule[] = [
  {
    source: "-----BEGIN [A-Z ]*PRIVATE KEY-----[\\s\\S]*?-----END [A-Z ]*PRIVATE KEY-----",
    flags: "g",
    replace: "[REDACTED_PRIVATE_KEY]",
  },
  {
    source: "\\bgh[pousr]_[A-Za-z0-9]{20,}\\b",
    flags: "g",
    replace: "[REDACTED_GITHUB_TOKEN]",
  },
  {
    source: "\\bxox[baprs]-[A-Za-z0-9-]{10,}\\b",
    flags: "g",
    replace: "[REDACTED_SLACK_TOKEN]",
  },
  {
    source: "\\bBearer\\s+[A-Za-z0-9\\-._~+/=]+",
    flags: "gi",
    replace: "Bearer [REDACTED]",
  },
  {
    source: "\\b(?:aws_)?secret_access_key\\b\\s*[:=]\\s*(['\"])[^'\"]*\\1",
    flags: "gi",
    replace: 'secret_access_key = "[REDACTED]"',
  },
  {
    source:
      "\\b(password|passwd|secret|api_key|apikey|access_key|token|client_secret)\\b(\\s*[:=]\\s*)(['\"])[^'\"]*\\3",
    flags: "gi",
    replace: "$1$2$3[REDACTED]$3",
  },
  {
    source: "\\bAKIA[0-9A-Z]{16}\\b",
    flags: "g",
    replace: "[REDACTED_AWS_ACCESS_KEY]",
  },
];

export function redact(text: string): string {
  let output = text;
  for (const rule of RULES) {
    output = output.replace(new RegExp(rule.source, rule.flags), rule.replace);
  }
  return output;
}
