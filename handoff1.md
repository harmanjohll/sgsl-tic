SgSL Avatar — Handoff Brief
Project Goal
Build a Singapore Sign Language (SgSL) avatar app that:

Records sign language via webcam → MediaPipe Holistic
Replays signs accurately on a 3D anime-style VRM avatar
Eventually: text→sign translation, sentence composition, ML pipeline
Current State (working but imperfect)
Repository
GitHub: harmanjohll/sgsl-tic
Working branch: claude/avatar-discussion-jKqWi
Local path (Mac): /Users/kellytran/sgsl-tic
New code: in sgsl-avatar/ directory (separate from existing sgsl-hub/)
Architecture
sgsl-avatar/
├── frontend/
│   ├── index.html          # Two tabs: Viewer + Record
│   ├── js/
│   │   ├── app.js          # Tab controller
│   │   ├── avatar.js       # VRM 0.x loader (THREE global)
│   │   ├── retarget.js     # Kalidokit MediaPipe→VRM (verbatim demo port)
│   │   ├── recorder.js     # Webcam + MediaPipe + record
│   │   ├── player.js       # Sign playback
│   │   └── quality.js      # Quality scoring
│   └── assets/
│       └── avatar.vrm      # USER'S VRM 0.x model (saved locally, not in git)
├── backend/
│   ├── app.py              # FastAPI on port 8001
│   └── extract_signs.py    # SQL→JSON sign extractor
├── data/signs/             # JSON sign files
└── run.sh                  # Start script
Tech Stack (CRITICAL — these specific versions)
Three.js 0.133.0 (global script tag)
@pixiv/three-vrm 0.6.7 (VRM 0.x format ONLY)
Kalidokit 1.1.5 (ES module)
MediaPipe Holistic 0.5.1675471629 (note: world landmarks at results.za, NOT results.ea)
FastAPI backend
Local Mac dev: Python venv, no Docker
What Works
VRM avatar loads and faces camera
MediaPipe captures pose + face + both hands
Live preview in Record tab — avatar mirrors user (with tracking lag/imperfection)
Recording captures pose, poseWorld, face (all 478 pts), both hands
Quality gate scores recordings (A-F grade)
Save sign → JSON in data/signs/
Delete sign from Viewer
Signing space guide overlay on camera feed
Arms-at-sides default rest pose
Known Issues / Where We Stopped
Tracking precision is approximate, not pixel-perfect — same level as Kalidokit demo
Right hand sometimes not detected by MediaPipe (visibility issue)
Hip position causes slight floating — disabled position transfer for sign language
User reported playback inaccuracy — needs re-recording with new pipeline (latest commit 35c9981 added poseWorld field to recording, old recordings don't have it)
Fingers not perfectly precise during playback
Critical Lessons (avoid repeating)
What we tried that DIDN'T work:
SMPL-X mesh — looks scary, not Pixar-friendly
three-vrm v3 with VRM 1.0 model — getNormalizedBoneNode double-transforms coordinates, getRawBoneNode disconnects from rendered mesh
Custom retargeting math — many iterations of Y/Z negation, axis flipping, rotation orders — all dead ends
VRMUtils.rotateVRM0() in v3 — affects bone coordinate system
What WORKS:
Kalidokit verbatim from demo source (github.com/yeemachine/kalidokit/docs/script.js)
VRM 0.x format model + three-vrm 0.6.7 + Three.js 0.133
results.za for MediaPipe v0.5 world landmarks (demo used results.ea)
getBoneNode(THREE.VRMSchema.HumanoidBoneName[name]) for VRM 0.x bone access
Hand swap: leftHandLandmarks = results.rightHandLandmarks (selfie mirror)
How to Run Locally
cd /Users/kellytran/sgsl-tic/sgsl-avatar
source venv/bin/activate
./run.sh
# Open http://localhost:8001
User's Setup
Mac (Apple Silicon), Python 3.11
VRM 0.x model in frontend/assets/avatar.vrm (exported from VRoid Studio)
Sign data: 8 legacy signs from restore_signLibrary.sql + new recordings
Original sgsl-hub/ app uses Supabase PostgreSQL (production deployed on Render)
sgsl-avatar/ uses local JSON files (no DB)
User's Frustrations to Avoid
Don't make confident claims like "FIXED" then break things
Don't iterate small tweaks — investigate root cause first
When in doubt, replicate working reference code verbatim, don't interpret
Self-audit before claiming success
Get error info from console BEFORE making more guesses
The user can SEE the avatar — they tell you what's wrong, listen to specifics
Next Priorities (user wants)
Test new recording pipeline (latest commit) — re-record signs
Improve tracking precision/fidelity — calibration math, scaling
Sentence composition (multiple signs played in sequence)
ML pipeline planning — co-articulation, NMM generation, text→gloss
Migrate sign data to Supabase eventually (currently local JSON)
Key Files to Read First in New Chat
sgsl-avatar/frontend/js/retarget.js — heart of the system, verbatim from Kalidokit demo
sgsl-avatar/frontend/js/recorder.js — recording + camera handling
sgsl-avatar/frontend/js/player.js — playback (renderFrame converts stored→MediaPipe format)
sgsl-avatar/frontend/js/avatar.js — VRM loading + scene setup
sgsl-avatar/frontend/index.html — script tag versions matter
Latest Commit
35c9981 - Fix recording/playback pipeline + avatar sizing + rest pose + guide
