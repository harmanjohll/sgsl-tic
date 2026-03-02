"""
SgSL Hub — Sign Language Recognition Engine.

Two-stage recognizer:
1. DTW (Dynamic Time Warping) — works from the very first sample
2. k-NN classifier on resampled feature vectors — improves with more data

Feature vector per frame (59-D):
  - 48 values: 16 bone direction unit vectors (x, y, z)
  - 11 values: pairwise fingertip distances + palm reference distances
"""

import numpy as np
from sklearn.neighbors import KNeighborsClassifier

# MediaPipe hand skeleton
BONES = [
    (1, 2), (2, 3), (3, 4),        # thumb
    (5, 6), (6, 7), (7, 8),        # index
    (9, 10), (10, 11), (11, 12),   # middle
    (13, 14), (14, 15), (15, 16),  # ring
    (17, 18), (18, 19), (19, 20),  # pinky
    (0, 5),                        # palm
]

FINGERTIPS = [4, 8, 12, 16, 20]
RESAMPLE_LEN = 32


def normalize_frame(landmarks):
    """Normalize a single 21-landmark frame: wrist-relative, scale-invariant."""
    pts = np.array(landmarks, dtype=np.float64)
    if pts.shape[0] < 21:
        return None
    if pts.shape[1] == 2:
        pts = np.column_stack([pts, np.zeros(pts.shape[0])])
    wrist = pts[0]
    pts = pts - wrist
    palm_len = np.linalg.norm(pts[9] - pts[0])
    if palm_len < 1e-8:
        return None
    pts = pts / palm_len
    return pts


def extract_frame_features(pts):
    """Extract 59-D feature vector from normalized 21 landmarks."""
    feats = []
    for a, b in BONES:
        d = pts[b] - pts[a]
        n = np.linalg.norm(d)
        if n > 1e-8:
            d = d / n
        feats.extend(d.tolist())

    for i in range(len(FINGERTIPS)):
        for j in range(i + 1, len(FINGERTIPS)):
            feats.append(float(np.linalg.norm(pts[FINGERTIPS[i]] - pts[FINGERTIPS[j]])))
    feats.append(float(np.linalg.norm(pts[4] - pts[0])))
    return feats


def extract_sequence_features(landmarks_seq):
    """Extract per-frame features from a full recording sequence.
    Returns list of 59-D vectors (one per valid frame)."""
    features = []
    for frame in landmarks_seq:
        pts = normalize_frame(frame)
        if pts is not None:
            features.append(extract_frame_features(pts))
    return features


def resample_sequence(seq, target_len=RESAMPLE_LEN):
    """Resample a variable-length sequence to a fixed number of frames."""
    if not seq:
        return []
    arr = np.array(seq)
    n = len(arr)
    if n == target_len:
        return arr.tolist()
    indices = np.linspace(0, n - 1, target_len)
    resampled = []
    for idx in indices:
        lo = int(np.floor(idx))
        hi = min(lo + 1, n - 1)
        t = idx - lo
        resampled.append(((1 - t) * arr[lo] + t * arr[hi]).tolist())
    return resampled


def flatten_resampled(resampled):
    """Flatten resampled sequence into a single feature vector for k-NN."""
    return [v for frame in resampled for v in frame]


# --- DTW ---
def dtw_distance(seq_a, seq_b):
    """Compute DTW distance between two feature sequences."""
    n, m = len(seq_a), len(seq_b)
    if n == 0 or m == 0:
        return float("inf")
    a = np.array(seq_a)
    b = np.array(seq_b)
    cost = np.full((n + 1, m + 1), np.inf)
    cost[0, 0] = 0.0
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            d = float(np.linalg.norm(a[i - 1] - b[j - 1]))
            cost[i, j] = d + min(cost[i - 1, j], cost[i, j - 1], cost[i - 1, j - 1])
    path_len = n + m
    return cost[n, m] / path_len


def recognize_dtw(query_features, library):
    """Match query against library using DTW. Returns sorted matches."""
    if not query_features:
        return []
    results = []
    for entry in library:
        ref_features = entry["features"]
        if not ref_features:
            continue
        dist = dtw_distance(query_features, ref_features)
        results.append({"label": entry["label"], "distance": dist, "id": entry["id"]})
    results.sort(key=lambda x: x["distance"])

    if not results:
        return []
    max_dist = max(r["distance"] for r in results) or 1.0
    for r in results:
        r["confidence"] = max(0, 1 - r["distance"] / max_dist)

    seen = {}
    unique = []
    for r in results:
        if r["label"] not in seen:
            seen[r["label"]] = True
            unique.append(r)
    return unique[:5]


# --- k-NN classifier ---
class SignClassifier:
    """k-NN classifier on flattened, resampled feature sequences."""

    def __init__(self):
        self.model = None
        self.labels = []
        self.is_trained = False

    def train(self, library):
        """Train from library entries that have features."""
        X, y = [], []
        for entry in library:
            feats = entry.get("features")
            if not feats or len(feats) < 4:
                continue
            resampled = resample_sequence(feats, RESAMPLE_LEN)
            flat = flatten_resampled(resampled)
            X.append(flat)
            y.append(entry["label"])

        if len(X) < 2:
            self.is_trained = False
            return

        unique_labels = set(y)
        if len(unique_labels) < 2:
            self.is_trained = False
            return

        k = min(3, len(X))
        self.model = KNeighborsClassifier(n_neighbors=k, weights="distance", metric="euclidean")
        self.model.fit(X, y)
        self.labels = list(unique_labels)
        self.is_trained = True

    def predict(self, query_features):
        """Predict sign label from feature sequence."""
        if not self.is_trained or not query_features:
            return []
        resampled = resample_sequence(query_features, RESAMPLE_LEN)
        flat = flatten_resampled(resampled)
        X = np.array([flat])
        probs = self.model.predict_proba(X)[0]
        classes = self.model.classes_
        results = [
            {"label": str(classes[i]), "confidence": float(probs[i])}
            for i in range(len(classes))
        ]
        results.sort(key=lambda x: x["confidence"], reverse=True)
        return results[:5]


classifier = SignClassifier()
