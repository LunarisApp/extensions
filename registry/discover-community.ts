import { readCommunityPlugins } from "./config.ts";
import { DEFAULT_REGISTRY_BASE_URL } from "./constants.ts";

interface GithubRelease {
  draft: boolean;
  prerelease: boolean;
  tag_name: string;
}

const token = process.env.GITHUB_TOKEN;
const baseUrl = (
  process.env.REGISTRY_BASE_URL ?? DEFAULT_REGISTRY_BASE_URL
).replace(/\/$/, "");
const releases: Array<{ id: string; repository: string; tag: string }> = [];

for (const plugin of await readCommunityPlugins()) {
  const response = await fetch(
    `https://api.github.com/repos/${plugin.repository}/releases?per_page=100`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (!response.ok) {
    throw new Error(
      `Could not inspect ${plugin.repository} (${response.status})`,
    );
  }
  for (const release of (await response.json()) as GithubRelease[]) {
    if (release.draft || release.prerelease) continue;
    const descriptor = await fetch(
      `${baseUrl}/releases/${encodeURIComponent(plugin.id)}/${encodeURIComponent(release.tag_name)}.json`,
      { method: "HEAD", redirect: "follow" },
    );
    if (descriptor.status === 404) {
      releases.push({ ...plugin, tag: release.tag_name });
    } else if (!descriptor.ok) {
      throw new Error(
        `Could not inspect published release ${plugin.id}@${release.tag_name} (${descriptor.status})`,
      );
    }
  }
}

releases.sort((left, right) =>
  `${left.id}@${left.tag}`.localeCompare(`${right.id}@${right.tag}`),
);
process.stdout.write(JSON.stringify({ include: releases }));
