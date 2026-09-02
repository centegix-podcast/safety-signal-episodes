# Podcast playlist snapshot

A scheduled GitHub Actions job snapshots a public YouTube playlist to
`episodes.json` at the repo root. A Webflow embed fetches that JSON directly
from `raw.githubusercontent.com` (no server, no worker, no runtime API key in
the browser).

## Setup

1. **Create a YouTube Data API v3 key**
   - Go to the [Google Cloud Console](https://console.cloud.google.com/), create
     or select a project, and enable the **YouTube Data API v3**.
   - Under **APIs & Services → Credentials**, create an **API key**.

2. **Restrict the key**
   - Application restriction: none needed (it's only ever called from GitHub's
     servers, not a browser), but you can restrict by IP if your runner IPs
     are stable — usually not practical for GitHub-hosted runners, so leave
     this as "None" and rely on the API restriction below.
   - API restriction: restrict the key to **YouTube Data API v3** only.

3. **Add the secret**
   - In this repo: **Settings → Secrets and variables → Actions → New
     repository secret**.
   - Name: `YT_API_KEY`. Value: the key from step 1.

4. **Playlist ID and repo are already wired in**
   - `.github/workflows/refresh.yml` and `webflow-embed.html` are configured
     for playlist `PLV_xxR5BiqNk` and repo
     `centegix-podcast/safety-signal-episodes`. If you fork or repoint this, update
     `PLAYLIST_ID` in `refresh.yml` and both the playlist ID and
     `EPISODES_URL` (owner/repo) in `webflow-embed.html`.

5. **Run it once manually**
   - Go to **Actions → Refresh playlist snapshot → Run workflow**.
   - Confirm `episodes.json` is created/updated and committed.

6. **Paste the Webflow embed**
   - Paste the whole contents of `webflow-embed.html` into a Webflow **Embed**
     element.

## Important: scheduled workflow auto-disable

GitHub automatically disables scheduled (`cron`) workflows in a repo after
**~60 days with no activity** in the repo. If episodes stop updating, check
**Actions** for a "This scheduled workflow is disabled" banner — clicking
**Run workflow** manually re-enables it. Any commit to the repo also resets
the inactivity clock.

## Files

- `scripts/fetch-playlist.mjs` — fetches and normalizes the playlist, writes
  `episodes.json`. Run locally with `PLAYLIST_ID=... YT_API_KEY=... node
  scripts/fetch-playlist.mjs`.
- `scripts/test.mjs` — unit tests with a mocked `fetch`. Run with `node --test
  scripts/test.mjs`.
- `.github/workflows/refresh.yml` — hourly cron (top of the hour, UTC) +
  manual trigger; commits `episodes.json` only when it changed.
- `webflow-embed.html` — paste into a Webflow Embed element.
