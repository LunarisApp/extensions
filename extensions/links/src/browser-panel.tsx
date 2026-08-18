import { Alert02Icon, HugeiconsIcon } from "@lunarisapp/ui/icons";
import { useEffect } from "react";
import { labelFromUrl, normalizeLinkUrl } from "./domain";

export interface BrowserDestination {
  error: string | null;
  title: string;
  url: string | null;
}

export function parseBrowserDestination(
  params: Record<string, unknown>,
): BrowserDestination {
  const rawUrl = typeof params.url === "string" ? params.url : "";
  const normalized = normalizeLinkUrl(rawUrl);
  const suppliedTitle = typeof params.title === "string" ? params.title.trim() : "";
  return {
    error: normalized.error,
    title:
      suppliedTitle || (normalized.url ? labelFromUrl(normalized.url) : "Link"),
    url: normalized.url,
  };
}

export function BrowserPanel({ params }: { params: Record<string, unknown> }) {
  const destination = parseBrowserDestination(params);

  useEffect(() => {
    if (!destination.url) return;
    const timer = window.setTimeout(() => {
      window.location.assign(destination.url as string);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [destination.url]);

  if (!destination.url) {
    return (
      <main className="links-browser-state" role="alert">
        <HugeiconsIcon aria-hidden="true" icon={Alert02Icon} size={24} />
        <h1>Could not open this link</h1>
        <p>{destination.error ?? "The saved address is unavailable."}</p>
      </main>
    );
  }

  return (
    <main className="links-browser-state" aria-busy="true">
      <span className="links-loading-mark" aria-hidden="true" />
      <h1>Opening {destination.title}</h1>
      <p>{destination.url}</p>
    </main>
  );
}
