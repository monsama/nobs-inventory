#!/usr/bin/env bash
# Checks that every action version the workflows use is a real tag on GitHub, so a bad version fails here, not at release.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
bad=0
refs=$(grep -h "uses:" .github/workflows/*.yml | sed 's/.*uses: *//' | sort -u)
for ref in $refs; do
  repo="${ref%@*}"; tag="${ref##*@}"
  if git ls-remote --tags "https://github.com/$repo" "refs/tags/$tag" | grep -q .; then echo "ok      $ref"
  else echo "MISSING $ref"; bad=1; fi
done
exit $bad
