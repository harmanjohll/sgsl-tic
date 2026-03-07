# SgSL Communication App — Development Plan

## Mission
Build a bidirectional SgSL communication platform where:
- **Direction 1 (Sign → Text)**: Camera captures signing → ML recognises → text/speech output
- **Direction 2 (Text → Sign)**: Text/speech input → NLP parsing → 3D avatar performs signs

The avatar is the lynchpin. It is the entire output channel for hearing-to-deaf communication.

---

## Phase 1: Foundation Cleanup

### 1.1 Remove Legacy Code
- Delete `/js`, `/css`, root `/index.html` (the old pre-sgsl-hub code)
- These duplicate functionality and create confusion about the canonical codebase
- All development moves to `/sgsl-hub/` exclusively

### 1.2 Consolidate Avatar to 3D Humanoid Only
- Remove the SVG avatar system (`avatar.js`, 1001 lines)
- The 3D humanoid (`humanoid.js` + `tom.glb`) is the path forward
- Update `viewer.js` and `app.js` to remove SVG avatar references
- Remove the Avatar/3D toggle in the UI — only one renderer

### 1.3 Database Schema: Add Language Support
- Add `language TEXT DEFAULT 'sgsl'` column to the `signs` table
- This prepares for future ASL/BSL support without breaking existing data
- Update `save_sign()`, queries, and API responses to include language

### 1.4 Testing & CI Infrastructure
- Add `pytest` with basic backend tests (API routes, DB operations, feature extraction)
- Add GitHub Actions workflow: lint + test on push
- Add a simple frontend smoke test (optional, lower priority)

### 1.5 Clean Up the Viewer Module
- Currently `viewer.js` (497 lines) renders a procedural wireframe hand — this is superseded by the 3D humanoid
- Merge any useful wireframe logic into the humanoid system or remove

---

## Phase 2: Avatar Pipeline (Critical Path)

This is the hardest and most important phase. The goal: a deaf SgSL user should be able to understand what the avatar is signing.

### 2.1 Sign Motion Database
The contribution system already captures MediaPipe landmarks per sign. These same landmarks must drive avatar playback:
- Ensure landmark data stored in the DB has consistent holistic format: `{leftHand, rightHand, face, pose}`
- Normalize all stored landmarks to a canonical coordinate frame (wrist-relative for hands, shoulder-relative for pose)
- Build an API endpoint: `GET /api/sign/{label}/animation` — returns the landmark sequence optimised for playback

### 2.2 Humanoid Avatar: Improve Playback Quality
Current issues with `humanoid.js`:
- **Arm IK is basic**: Two-bone IK with heuristic rest-direction detection. Needs proper pole-vector constraints for natural elbow positioning
- **Finger pose uses raw angles**: Works but produces jittery results. Need temporal smoothing (low-pass filter or Kalman filter on joint angles)
- **No co-articulation**: Signs play back frame-by-frame with minimum-jerk interpolation between frames, but there's no blending between *different* signs in a sequence
- **FACS facial mapping is minimal**: Only 6 Action Units (1, 2, 4, 20, 25, 26). SgSL NMMs need at minimum: head tilt, head nod/shake, eye gaze direction, cheek puff, lip morphemes
- **WBC torso is reactive only**: Follows hand position rather than leading movement as real signers do

#### Improvements needed:
1. **Smooth IK with pole vectors**: Elbow should track a natural pole target (slightly behind and below the shoulder plane)
2. **Temporal filtering**: Apply exponential moving average or one-euro filter to all bone rotations before applying to skeleton
3. **Enhanced FACS**: Map more AUs from the 32-point face subset. Add head rotation from pose landmarks (pose[0] = nose, pose[7/8] = ears give head orientation)
4. **Sign transition blending**: When playing a sentence (multiple signs), blend the last N frames of sign A with the first N frames of sign B using crossfade interpolation
5. **Idle breathing animation**: Subtle chest/shoulder movement when not signing — makes the avatar feel alive

### 2.3 Text → SgSL Gloss Parser
SgSL has different grammar from English. Basic rules:
- Topic-comment structure (e.g., "I go school" → "SCHOOL I GO")
- Time references come first (e.g., "Yesterday I ate" → "YESTERDAY EAT I")
- Questions marked by NMMs (eyebrow raise), not word order
- Negation uses head shake + sign

Initial implementation:
- Simple rule-based parser: tokenise English text → reorder to SgSL gloss order
- Map each gloss token to a sign label in the database
- Return ordered list of sign labels with NMM annotations (e.g., `{sign: "school", nmm: null}, {sign: "go", nmm: "question"}`)
- Start with a small vocabulary (greetings, numbers, common phrases) and expand

### 2.4 Sentence Playback Engine
- Chain multiple sign animations with transition blending
- Insert appropriate pauses between signs (real signers pause ~200ms between signs, longer at phrase boundaries)
- Apply NMM overlays (e.g., raise eyebrows for duration of a question)
- Playback controls: play/pause, speed, scrub through sentence

### 2.5 Avatar Model Quality
- Current `tom.glb` (13.9MB, 63 bones) — evaluate if morph targets / blendshapes are sufficient for NMMs
- If not: source or create a model with richer facial blendshapes (ARKit 52 blendshape standard)
- Consider a second avatar model for visual diversity (already scaffolded: `rajan.glb` path exists but file is missing)

---

## Phase 3: Recognition Improvements

### 3.1 Continuous Sign Recognition
Current system recognises one isolated sign at a time. For real communication:
- Detect sign boundaries in a continuous stream (start/end of each sign)
- Sliding window approach: extract features over overlapping windows
- Confidence threshold to determine when a sign is "complete"

### 3.2 Sentence Context
- After individual signs are recognised, apply language model to infer sentence meaning
- SgSL gloss → English text translation (reverse of the parser in 2.3)
- Use recognition confidence to disambiguate similar signs

### 3.3 ML Pipeline Improvements
- Move from in-memory training to persistent model files
- Model versioning (save/load trained models, track accuracy over time)
- Evaluation benchmark: hold out N% of data for testing, report accuracy metrics
- Consider LSTM or Transformer-based sequence model as alternative to DTW+k-NN

---

## Phase 4: Communication Interface

### 4.1 Conversation Mode UX
- Split-screen layout: camera feed (for signer) + text output (for reader)
- Or: text input (for hearing person) + avatar playback (for deaf person)
- Real-time bidirectional flow
- Conversation history panel

### 4.2 Mobile & PWA
- Progressive Web App with service worker for offline capability
- Responsive design optimised for phone cameras
- Reduce MediaPipe model download size with caching

### 4.3 Accessibility
- High contrast mode
- Screen reader support for text elements
- Haptic feedback hooks (for future wearable integration)

---

## Phase 5: Scale & Extend

### 5.1 Community & Content
- Contributor leaderboard and gamification
- Visual dictionary: browse signs by category
- Vocabulary builder with spaced repetition

### 5.2 Multi-Language Architecture
- Language selector in UI
- Route recognition and playback through language-specific models
- Shared landmark format across sign languages

### 5.3 Wearable Integration
- Smartwatch sensor data (accelerometer/gyroscope) as supplemental input
- AR glasses overlay for real-time sign-to-text
- Haptic alerts for incoming communication

---

## Immediate Next Steps (What We Build First)

Priority order for coding:

1. **Phase 1.1 + 1.2**: Clean up legacy code, consolidate to 3D humanoid avatar only
2. **Phase 2.2**: Improve the humanoid avatar playback quality (IK, smoothing, FACS, transitions)
3. **Phase 2.1**: Normalise sign motion data for consistent playback
4. **Phase 2.3 + 2.4**: Text→SgSL parser and sentence playback engine
5. **Phase 1.3**: Add language field to DB schema
6. **Phase 1.4**: Testing infrastructure

This gets us to a working bidirectional communication prototype with a quality avatar.
