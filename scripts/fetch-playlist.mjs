#!/usr/bin/env node
// Snapshots a YouTube playlist to episodes.json. Node 20+, no dependencies.

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_BASE = "https://www.googleapis.com/youtube/v3/playlistItems";
const MAX_PAGES = 40;

const PLAYLIST_ID = process.env.PLAYLIST_ID;
const YT_API_KEY = process.env.YT_API_KEY;

function fallbackThumbnail(videoId) {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

function isUnavailable(item) {
  const title = item.snippet?.title;
  if (title === "Private video" || title === "Deleted video") return true;
  if (item.status?.privacyStatus === "private") return true;
  return false;
}

function pickThumbnail(item) {
  const thumbs = item.snippet?.thumbnails;
  if (thumbs && Object.keys(thumbs).length > 0) {
    const best =
      thumbs.medium || thumbs.high || thumbs.default || Object.values(thumbs)[0];
    if (best?.url) return best.url;
  }
  return fallbackThumbnail(item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId);
}

async function fetchAllPages(playlistId, apiKey, fetchImpl = fetch) {
  const items = [];
  let pageToken;
  let pageCount = 0;

  do {
    pageCount += 1;
    if (pageCount > MAX_PAGES) {
      throw new Error(
        `Exceeded max page guard (${MAX_PAGES} pages) while fetching playlist ${playlistId}`
      );
    }

    const url = new URL(API_BASE);
    url.searchParams.set("part", "snippet,contentDetails,status");
    url.searchParams.set("playlistId", playlistId);
    url.searchParams.set("maxResults", "50");
    url.searchParams.set("key", apiKey);
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetchImpl(url.toString());
    const body = await res.json();

    if (!res.ok) {
      const reason = body?.error?.errors?.[0]?.reason;
      const message = body?.error?.message;
      throw new Error(
        `YouTube API request failed (status ${res.status}): ${message ?? "unknown error"}${
          reason ? ` [reason: ${reason}]` : ""
        }`
      );
    }

    items.push(...(body.items ?? []));
    pageToken = body.nextPageToken;
  } while (pageToken);

  return items;
}

function buildEntries(rawItems) {
  const entries = rawItems
    .filter((item) => !isUnavailable(item))
    .map((item) => {
      const videoId = item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId;
      return {
        videoId,
        title: item.snippet?.title ?? "",
        position: item.snippet?.position ?? 0,
        published: item.contentDetails?.videoPublishedAt ?? null,
        thumbnail: pickThumbnail(item),
      };
    });

  entries.sort((a, b) => a.position - b.position);
  return entries;
}

export async function buildPlaylistSnapshot(playlistId, apiKey, fetchImpl = fetch) {
  if (!playlistId) throw new Error("PLAYLIST_ID is required");
  if (!apiKey) throw new Error("YT_API_KEY is required");

  const rawItems = await fetchAllPages(playlistId, apiKey, fetchImpl);
  const entries = buildEntries(rawItems);

  if (entries.length === 0) {
    throw new Error(
      "Refusing to write episodes.json: zero entries survived filtering. " +
        "This would overwrite a previously good snapshot with an empty one."
    );
  }

  return {
    playlistId,
    count: entries.length,
    updatedAt: new Date().toISOString(),
    entries,
  };
}

async function main() {
  const snapshot = await buildPlaylistSnapshot(PLAYLIST_ID, YT_API_KEY);
  const outPath = path.join(process.cwd(), "episodes.json");
  await writeFile(outPath, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
  console.log(`Wrote ${snapshot.count} entries to ${outPath}`);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
