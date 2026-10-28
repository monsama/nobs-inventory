#!/usr/bin/env bash
# Checks every action the workflows use. An action is pinned to a commit, with its version as a comment
# (uses: owner/repo@<sha> # v7), so a moved or hijacked tag cannot change what runs: the check says when a version tag
# is gone or no longer points at the pinned commit (then pin the new commit on purpose). An action given by tag only
# must be a real tag.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
bad=0
while IFS= read -r line; do
  ref="$(sed -E 's/.*uses: *([^ #]+).*/\1/' <<<"$line")"; tag="$(sed -nE 's/.*# *([^ ]+) *$/\1/p' <<<"$line")"
  repo="${ref%@*}"; at="${ref##*@}"
  if [[ "$at" =~ ^[0-9a-f]{40}$ ]]; then
    [ -n "$tag" ] || { echo "NO TAG  $ref (add the version as a comment)"; bad=1; continue; }
    now="$(git ls-remote --tags "https://github.com/$repo" "refs/tags/$tag" "refs/tags/$tag^{}" | awk '/\^\{\}/{p=$1} END{print p}')"
    [ -n "$now" ] || now="$(git ls-remote --tags "https://github.com/$repo" "refs/tags/$tag" | cut -f1)"
    if [ -z "$now" ]; then echo "MISSING $repo $tag"; bad=1
    elif [ "$now" = "$at" ]; then echo "ok      $repo $tag ($at)"
    else echo "MOVED   $repo $tag now points at $now, pinned $at"; fi
  elif git ls-remote --tags "https://github.com/$repo" "refs/tags/$at" | grep -q .; then echo "ok      $ref"
  else echo "MISSING $ref"; bad=1; fi
done < <(grep -h "uses:" .github/workflows/*.yml | sort -u)
exit $bad
