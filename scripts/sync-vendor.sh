#!/usr/bin/env bash
# Sync sibling wire clients into ./vendor for a self-contained npm pack.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PARENT="$(cd "$ROOT/.." && pwd)"
DEST="$ROOT/vendor"

if [[ ! -d "$PARENT/slack-ts" || ! -d "$PARENT/imessage-ts" || ! -d "$PARENT/whatsapp-personal-ts" || ! -d "$PARENT/whatsapp-business-ts" ]]; then
  if [[ -d "$DEST/slack" && -d "$DEST/imessage" && -d "$DEST/whatsapp" && -d "$DEST/whatsapp-business" ]]; then
    echo "sibling wire packages missing — keeping existing vendor/"
    exit 0
  fi
  echo "vendor sync failed: sibling packages not found and vendor/ incomplete" >&2
  exit 1
fi

rm -rf "$DEST"
mkdir -p "$DEST"

rsync -a --delete \
  --exclude node_modules --exclude .git --exclude '._*' --exclude .DS_Store \
  --exclude dist --exclude tests --exclude scripts \
  --exclude '.claude' --exclude '.cursor' --exclude '.vscode' --exclude '.zed' --exclude '.github' \
  "$PARENT/slack-ts/" "$DEST/slack/"

rsync -a --delete \
  --exclude node_modules --exclude .git --exclude '._*' --exclude .DS_Store \
  --exclude dist --exclude tests --exclude scripts \
  --exclude '.claude' --exclude '.cursor' --exclude '.vscode' --exclude '.zed' --exclude '.github' \
  "$PARENT/imessage-ts/" "$DEST/imessage/"

rsync -a --delete \
  --exclude node_modules --exclude .git --exclude '._*' --exclude .DS_Store \
  --exclude dist --exclude tests --exclude scripts \
  --exclude '.claude' --exclude '.cursor' --exclude '.vscode' --exclude '.zed' --exclude '.github' \
  "$PARENT/whatsapp-personal-ts/" "$DEST/whatsapp/"

mkdir -p "$DEST/whatsapp-business/src/rest"
cp "$PARENT/whatsapp-business-ts/package.json" "$DEST/whatsapp-business/"
cp "$PARENT/whatsapp-business-ts/src/skyline.ts" "$DEST/whatsapp-business/src/"
cp "$PARENT/whatsapp-business-ts/src/rest/client.ts" "$DEST/whatsapp-business/src/rest/"

# Slim WABA package to the Graph send client only.
DEST="$DEST" node <<'NODE'
const fs = require("node:fs");
const dest = process.env.DEST;
const pkgPath = `${dest}/whatsapp-business/package.json`;
const p = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
p.description = "Internal WhatsApp Business client for Skyline. Not a public API.";
p.files = ["src/skyline.ts", "src/rest", "README.md"];
p.exports = {
  ".": {
    types: "./src/skyline.ts",
    bun: "./src/skyline.ts",
    import: "./src/skyline.ts",
    default: "./src/skyline.ts",
  },
};
delete p.scripts;
delete p.devDependencies;
delete p.dependencies;
fs.writeFileSync(pkgPath, `${JSON.stringify(p, null, 2)}\n`);
for (const name of ["slack", "imessage", "whatsapp", "whatsapp-business"]) {
  const readme = `${dest}/${name}/README.md`;
  if (!fs.existsSync(readme)) {
    fs.writeFileSync(
      readme,
      `# @interactions-hq/${name}\n\nInternal wire client for Skyline. Not a public API.\n`
    );
  }
}
NODE

find "$DEST" -name '._*' -delete 2>/dev/null || true
echo "vendor synced → $DEST"
