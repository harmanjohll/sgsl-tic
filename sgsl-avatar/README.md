# SgSL Avatar — SMPL-X Sign Language Viewer

A rebuilt sign language avatar system using the SMPL-X skeleton specification. Designed for accurate hand articulation and facial expression in Singapore Sign Language (SgSL) dictionary playback.

## Quick Start (Mac Apple Silicon)

### 1. Pull the code
```bash
git pull origin claude/avatar-discussion-jKqWi
cd sgsl-avatar
```

### 2. Set up Python environment
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt
```

### 3. Extract sample sign data
```bash
python3 backend/extract_signs.py
```
This parses `restore_signLibrary.sql` and creates JSON files in `data/signs/`.

### 4. Run the server
```bash
./run.sh
```

### 5. Open in browser
```
http://localhost:8001
```

You'll see a geometric placeholder avatar (capsules and spheres) arranged in the SMPL-X 55-joint skeleton. Click any sign in the sidebar to play it.

---

## Upgrade to SMPL-X Mesh (Optional)

The geometric placeholder works immediately. For the full SMPL-X mesh:

### 1. Register for SMPL-X model weights
- Go to https://smpl-x.is.tue.mpg.de
- Create an account (free for research/education)
- Download `SMPLX_NEUTRAL.npz`

### 2. Install additional dependencies
```bash
pip install torch smplx trimesh
```

On Apple Silicon Mac, PyTorch installs with MPS (Metal) acceleration automatically.

### 3. Place model weights
```bash
mkdir -p backend/models/smplx
# Copy SMPLX_NEUTRAL.npz to backend/models/smplx/
```

### 4. Generate the GLB mesh
```bash
python3 backend/generate_mesh.py
```
This creates `frontend/assets/smplx_neutral.glb`.

### 5. Refresh browser
The avatar automatically upgrades from geometric placeholder to the full SMPL-X mesh.

---

## Architecture

```
sgsl-avatar/
├── frontend/
│   ├── index.html          # Test page
│   ├── css/styles.css      # Styling
│   └── js/
│       ├── avatar.js       # Three.js scene + SMPL-X skeleton
│       ├── retarget.js     # MediaPipe → SMPL-X bone rotations
│       └── player.js       # Playback engine + UI
├── backend/
│   ├── app.py              # FastAPI server (port 8001)
│   ├── requirements.txt    # Python dependencies
│   ├── extract_signs.py    # SQL → JSON sign extractor
│   └── generate_mesh.py    # SMPL-X → GLB export
└── data/signs/             # Extracted sign JSON files
```

### Key Difference from sgsl-hub

The old system (`sgsl-hub/frontend/js/humanoid.js`) auto-detects bone names and guesses axis conventions from unknown GLB models. This causes hand distortion and incorrect animation.

The new system hardcodes the SMPL-X skeleton — every bone name, parent, and rotation axis is known. No guessing = no distortion.

### SMPL-X Skeleton (55 joints)
- **Body** (22): pelvis, spine chain, neck, head, shoulders, elbows, wrists, hips, knees, ankles
- **Hands** (30): 15 per hand — 3 joints each for thumb, index, middle, ring, pinky
- **Face** (3): jaw, left eye, right eye

---

## Ports

| Service | Port | Purpose |
|---------|------|---------|
| sgsl-hub (existing) | 8000 | Full SgSL app |
| sgsl-avatar (new) | 8001 | Avatar test viewer |

Both can run simultaneously for side-by-side comparison.
