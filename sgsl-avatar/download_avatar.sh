#!/usr/bin/env bash
# Download a free VRM avatar model for the SgSL Avatar viewer.
#
# This downloads the three-vrm sample model (AvatarSample_B)
# from the official @pixiv/three-vrm GitHub repository.
# It's a simple anime-style character with finger bones.

set -e
cd "$(dirname "$0")"

OUTPUT="frontend/assets/avatar.vrm"
mkdir -p frontend/assets

echo "Downloading VRM avatar model..."

# Try the three-vrm sample model
URL="https://pixiv.github.io/three-vrm/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm"

if command -v curl &> /dev/null; then
  curl -L -o "$OUTPUT" "$URL" 2>/dev/null || true
elif command -v wget &> /dev/null; then
  wget -q -O "$OUTPUT" "$URL" || true
fi

# Check if download succeeded (file should be > 100KB)
if [ -f "$OUTPUT" ] && [ $(stat -f%z "$OUTPUT" 2>/dev/null || stat -c%s "$OUTPUT" 2>/dev/null) -gt 100000 ]; then
  echo "Downloaded: $OUTPUT"
  echo "Refresh your browser at localhost:8001"
else
  rm -f "$OUTPUT"
  echo ""
  echo "Automatic download failed. Please download a VRM model manually:"
  echo ""
  echo "Option 1: VRoid Hub (recommended)"
  echo "  1. Go to https://hub.vroid.com"
  echo "  2. Browse free models (filter by 'free download')"
  echo "  3. Download the .vrm file"
  echo "  4. Copy it to: $(pwd)/frontend/assets/avatar.vrm"
  echo ""
  echo "Option 2: Create your own in VRoid Studio (free)"
  echo "  1. Download VRoid Studio from https://vroid.com/en/studio"
  echo "  2. Create a character"
  echo "  3. Export as VRM"
  echo "  4. Copy to: $(pwd)/frontend/assets/avatar.vrm"
  echo ""
  echo "Option 3: Sample model"
  echo "  1. Go to https://github.com/pixiv/three-vrm/tree/dev/packages/three-vrm/examples"
  echo "  2. Download any .vrm file from the models folder"
  echo "  3. Copy to: $(pwd)/frontend/assets/avatar.vrm"
fi
