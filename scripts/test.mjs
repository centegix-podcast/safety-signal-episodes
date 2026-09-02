import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlaylistSnapshot } from "./fetch-playlist.mjs";

function makeItem({ videoId, title, position, publishedAt, privacyStatus = "public", thumbnails }) {
  return {
    snippet: {
      title,
      position,
      resourceId: { videoId },
      thumbnails: thumbnails ?? {
        medium: { url: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` },
      },
    },
    contentDetails: {
      videoId,
      videoPublishedAt: publishedAt,
    },
    status: { privacyStatus },
  };
}

function jsonResponse(body, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

test("multi-page pagination concatenates correctly and sends the right pageToken", async () => {
  const calls = [];

  const page1Items = Array.from({ length: 50 }, (_, i) =>
    makeItem({ videoId: `v${i}`, title: `Title ${i}`, position: i, publishedAt: `2026-01-0${(i % 9) + 1}T00:00:00Z` })
  );
  const page2Items = Array.from({ length: 50 }, (_, i) =>
    makeItem({ videoId: `v${i + 50}`, title: `Title ${i + 50}`, position: i + 50, publishedAt: `2026-01-01T00:00:00Z` })
  );
  const page3Items = Array.from({ length: 37 }, (_, i) =>
    makeItem({ videoId: `v${i + 100}`, title: `Title ${i + 100}`, position: i + 100, publishedAt: `2026-01-01T00:00:00Z` })
  );

  const fetchImpl = async (url) => {
    calls.push(url);
    const u = new URL(url);
    const pageToken = u.searchParams.get("pageToken");
    if (!pageToken) {
      return jsonResponse({ items: page1Items, nextPageToken: "TOKEN_2" });
    }
    if (pageToken === "TOKEN_2") {
      return jsonResponse({ items: page2Items, nextPageToken: "TOKEN_3" });
    }
    if (pageToken === "TOKEN_3") {
      return jsonResponse({ items: page3Items });
    }
    throw new Error(`unexpected pageToken ${pageToken}`);
  };

  const snapshot = await buildPlaylistSnapshot("PL123", "fake-key", fetchImpl);

  assert.equal(calls.length, 3, "expected exactly 3 page requests");
  assert.equal(new URL(calls[0]).searchParams.get("pageToken"), null);
  assert.equal(new URL(calls[1]).searchParams.get("pageToken"), "TOKEN_2");
  assert.equal(new URL(calls[2]).searchParams.get("pageToken"), "TOKEN_3");
  assert.equal(snapshot.count, 137);
  assert.equal(snapshot.entries.length, 137);
});

test("private and deleted placeholder items are dropped", async () => {
  const items = [
    makeItem({ videoId: "a", title: "Real Episode", position: 0, publishedAt: "2026-01-01T00:00:00Z" }),
    makeItem({ videoId: "b", title: "Private video", position: 1, publishedAt: null, thumbnails: {} }),
    makeItem({ videoId: "c", title: "Deleted video", position: 2, publishedAt: null, thumbnails: {} }),
    makeItem({ videoId: "d", title: "Another Real One", position: 3, publishedAt: "2026-01-02T00:00:00Z", privacyStatus: "private" }),
    makeItem({ videoId: "e", title: "Yet Another", position: 4, publishedAt: "2026-01-03T00:00:00Z" }),
  ];

  const fetchImpl = async () => jsonResponse({ items });
  const snapshot = await buildPlaylistSnapshot("PL123", "fake-key", fetchImpl);

  assert.equal(snapshot.entries.length, 2);
  assert.deepEqual(
    snapshot.entries.map((e) => e.videoId),
    ["a", "e"]
  );
});

test("output is sorted ascending by position", async () => {
  const items = [
    makeItem({ videoId: "c", title: "Third", position: 2, publishedAt: "2026-01-01T00:00:00Z" }),
    makeItem({ videoId: "a", title: "First", position: 0, publishedAt: "2026-01-01T00:00:00Z" }),
    makeItem({ videoId: "b", title: "Second", position: 1, publishedAt: "2026-01-01T00:00:00Z" }),
  ];

  const fetchImpl = async () => jsonResponse({ items });
  const snapshot = await buildPlaylistSnapshot("PL123", "fake-key", fetchImpl);

  assert.deepEqual(
    snapshot.entries.map((e) => e.videoId),
    ["a", "b", "c"]
  );
});

test("a non-ok response throws with the reason attached", async () => {
  const fetchImpl = async () =>
    jsonResponse(
      {
        error: {
          message: "The playlist identified with the requested ID cannot be found.",
          errors: [{ reason: "playlistNotFound" }],
        },
      },
      false,
      404
    );

  await assert.rejects(
    () => buildPlaylistSnapshot("PLBAD", "fake-key", fetchImpl),
    (err) => {
      assert.match(err.message, /playlistNotFound/);
      assert.match(err.message, /cannot be found/);
      return true;
    }
  );
});

test("a zero-entry result throws rather than writing the file", async () => {
  const items = [
    makeItem({ videoId: "a", title: "Private video", position: 0, publishedAt: null, thumbnails: {} }),
    makeItem({ videoId: "b", title: "Deleted video", position: 1, publishedAt: null, thumbnails: {} }),
  ];

  const fetchImpl = async () => jsonResponse({ items });

  await assert.rejects(
    () => buildPlaylistSnapshot("PL123", "fake-key", fetchImpl),
    /Refusing to write episodes\.json/
  );
});
