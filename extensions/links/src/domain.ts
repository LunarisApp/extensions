import type { CompileContent } from "@lunarisapp/plugin-sdk";

export const LINKS_MAP_NAME = "link";
export const LINK_RECORD_KEY = "record";
export const MAX_LINK_URL_LENGTH = 4_096;

export interface LinkRecord {
  label: string;
  url: string;
  version: 1;
}

export interface NormalizedLinkUrl {
  error: string | null;
  url: string | null;
}

export const DEFAULT_LINK_RECORD: LinkRecord = {
  label: "",
  url: "",
  version: 1,
};

export function normalizeLinkUrl(input: string): NormalizedLinkUrl {
  const candidate = input.trim();
  if (!candidate) return { error: "Enter a web address.", url: null };
  if (candidate.length > MAX_LINK_URL_LENGTH) {
    return {
      error: `Web addresses must be ${MAX_LINK_URL_LENGTH.toLocaleString("en-US")} characters or fewer.`,
      url: null,
    };
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(candidate) && !/^https?:/i.test(candidate)) {
    return { error: "Links must use HTTP or HTTPS.", url: null };
  }

  const withScheme = /^https?:\/\//i.test(candidate)
    ? candidate
    : `https://${candidate}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { error: "Enter a valid web address, such as example.com.", url: null };
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { error: "Links must use HTTP or HTTPS.", url: null };
  }
  if (!parsed.hostname) {
    return { error: "Enter a web address with a host name.", url: null };
  }
  if (parsed.username || parsed.password) {
    return { error: "Remove the username or password from this address.", url: null };
  }

  return { error: null, url: parsed.toString() };
}

export function labelFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "Link";
  }
}

export function parseLinkRecord(value: unknown): LinkRecord {
  if (!value || typeof value !== "object") return DEFAULT_LINK_RECORD;
  const candidate = value as Record<string, unknown>;
  const label = typeof candidate.label === "string" ? candidate.label.trim() : "";
  const rawUrl = typeof candidate.url === "string" ? candidate.url : "";
  if (!rawUrl.trim()) return { label, url: "", version: 1 };

  const normalized = normalizeLinkUrl(rawUrl);
  return normalized.url
    ? { label: label || labelFromUrl(normalized.url), url: normalized.url, version: 1 }
    : { label, url: "", version: 1 };
}

export function createLinkRecord(label: string, url: string): LinkRecord {
  const normalized = normalizeLinkUrl(url);
  if (!normalized.url) throw new Error(normalized.error ?? "Invalid link");
  return {
    label: label.trim() || labelFromUrl(normalized.url),
    url: normalized.url,
    version: 1,
  };
}

export function buildLinkCompileContent(record: LinkRecord): CompileContent {
  return {
    title: record.label || "Link",
    sections: record.url
      ? [
          { level: 1, text: record.label || labelFromUrl(record.url), type: "heading" },
          { text: record.url, type: "paragraph" },
        ]
      : [{ text: "No web address has been attached yet.", type: "paragraph" }],
  };
}
