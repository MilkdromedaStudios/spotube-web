#!/bin/sh
# Puts a parked music service back on the site.
# Usage: sh disabled-providers/restore.sh soundcloud
#        sh disabled-providers/restore.sh apple-music
set -e
# Run from the web app's folder (the one holding src/), wherever it sits in the repository.
cd "$(dirname "$0")/.."
prefix="$(git rev-parse --show-prefix)"

name="$1"
case "$name" in
  soundcloud) other=apple-music ;;
  apple-music) other=soundcloud ;;
  *) echo "Usage: sh disabled-providers/restore.sh soundcloud|apple-music"; exit 1 ;;
esac
dir="disabled-providers/$name"
[ -f "$dir/restore.patch" ] || { echo "$name is already on the site."; exit 1; }

# Each service has two patches: one for when the other service is still parked,
# and one for when it has already been put back.
patch="$dir/restore.patch"
[ -f "disabled-providers/$other/restore.patch" ] || patch="$dir/restore-after-$other.patch"

git apply -3 ${prefix:+--directory="${prefix%/}"} "$patch"
(cd "$dir/files" && find . -type f | sed 's|^\./||') | while read -r f; do
  mkdir -p "$(dirname "$f")"
  git mv "$dir/files/$f" "$f"
done
git rm -r -q "$dir"
rm -rf "$dir"

echo "$name is back. Check it with: npx tsc --noEmit && npx next build"
echo "Then commit and push; Cloudflare Pages redeploys the site."
