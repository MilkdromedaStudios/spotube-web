# Parked music services

Apple Music and SoundCloud were taken off the site on 2026-10-12. Their code is kept here, unchanged,
so either one can be put back later. Nothing in this folder is built or deployed (`tsconfig.json`
excludes it).

| Folder | What it held | Keys it needs once it's back |
| --- | --- | --- |
| `soundcloud/` | Pasted SoundCloud songs and playlists (SoundCloud's own player), SoundCloud search | None for pasted links. Search needs `SOUNDCLOUD_CLIENT_ID` and `SOUNDCLOUD_CLIENT_SECRET`, which SoundCloud only gives to Artist Pro accounts. |
| `apple-music/` | Apple Music search, links and playback (Apple's MusicKit player) | `APPLE_MUSIC_TEAM_ID`, `APPLE_MUSIC_KEY_ID`, `APPLE_MUSIC_PRIVATE_KEY` (a MusicKit key from the paid Apple Developer Program). Without them Apple Music stays off. Listeners hear previews unless they sign in with an Apple Music subscription. |

Songs and playlists that listeners saved from these services stay in their libraries with a grey badge.
They can't play while the service is parked and play again once it's back.

## Putting a service back

The easiest way is to ask Claude in this project, for example "Put SoundCloud back from
disabled-providers". To do it yourself, from the repository folder:

```bash
sh disabled-providers/restore.sh soundcloud     # or: apple-music
npx tsc --noEmit && npx next build               # check it builds
git commit -am "Put SoundCloud back" && git push
```

The script:

1. applies the service's patch, which re-adds it everywhere it was removed (the list of services, link
   reading, the player, settings, the `/api` routes, the site's Content-Security-Policy and the README);
2. moves the files in `<service>/files/` back to the same paths under `src/`;
3. deletes the service's folder here.

Each service has two patches. `restore.patch` is for when the other service is still parked;
`restore-after-<other>.patch` is for when the other one is already back. The script picks the right
one. If the site's code has changed a lot since 2026-10-12, `git apply -3` may stop with conflict
markers in a few files; fix those by hand (or ask Claude), then build and commit.

After pushing, add any keys from the table above in Cloudflare: Workers & Pages → spotube-web →
Settings → Variables and Secrets, then Deployments → Retry deployment.

Another way to get a service back is to revert the commit that parked it ("Move SoundCloud to
disabled-providers" or "Move Apple Music to disabled-providers") with `git revert`. That works best
for the service that was parked last (SoundCloud).
