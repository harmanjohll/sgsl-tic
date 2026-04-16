"""
SMPL-X → GLB Export

Generates a rigged GLB mesh from SMPL-X model weights for use
in the Three.js avatar viewer.

Prerequisites:
  pip install torch smplx trimesh numpy

Usage:
  1. Download SMPLX_NEUTRAL.npz from https://smpl-x.is.tue.mpg.de
  2. Place in backend/models/smplx/
  3. Run: python generate_mesh.py

Output:
  frontend/assets/smplx_neutral.glb
"""

import os
import sys
import json
import struct
import numpy as np
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
MODEL_DIR = SCRIPT_DIR / "models" / "smplx"
OUTPUT_PATH = PROJECT_DIR / "frontend" / "assets" / "smplx_neutral.glb"

# SMPL-X joint parent indices (55 joints)
SMPLX_PARENT = [
    -1,  # 0: pelvis
     0,  # 1: left_hip
     0,  # 2: right_hip
     0,  # 3: spine1
     1,  # 4: left_knee
     2,  # 5: right_knee
     3,  # 6: spine2
     4,  # 7: left_ankle
     5,  # 8: right_ankle
     6,  # 9: spine3
     7,  # 10: left_foot
     8,  # 11: right_foot
     9,  # 12: neck
     9,  # 13: left_collar
     9,  # 14: right_collar
    12,  # 15: head
    13,  # 16: left_shoulder
    14,  # 17: right_shoulder
    16,  # 18: left_elbow
    17,  # 19: right_elbow
    18,  # 20: left_wrist
    19,  # 21: right_wrist
    # Left hand (22-36)
    20, 22, 23,  # index
    20, 25, 26,  # middle
    20, 28, 29,  # pinky
    20, 31, 32,  # ring
    20, 34, 35,  # thumb
    # Right hand (37-51)
    21, 37, 38,  # index
    21, 40, 41,  # middle
    21, 43, 44,  # pinky
    21, 46, 47,  # ring
    21, 49, 50,  # thumb
    # Face
    15, 15, 15,  # jaw, left_eye, right_eye
]

JOINT_NAMES = [
    "pelvis", "left_hip", "right_hip", "spine1",
    "left_knee", "right_knee", "spine2",
    "left_ankle", "right_ankle", "spine3",
    "left_foot", "right_foot", "neck",
    "left_collar", "right_collar", "head",
    "left_shoulder", "right_shoulder",
    "left_elbow", "right_elbow",
    "left_wrist", "right_wrist",
    "left_index1", "left_index2", "left_index3",
    "left_middle1", "left_middle2", "left_middle3",
    "left_pinky1", "left_pinky2", "left_pinky3",
    "left_ring1", "left_ring2", "left_ring3",
    "left_thumb1", "left_thumb2", "left_thumb3",
    "right_index1", "right_index2", "right_index3",
    "right_middle1", "right_middle2", "right_middle3",
    "right_pinky1", "right_pinky2", "right_pinky3",
    "right_ring1", "right_ring2", "right_ring3",
    "right_thumb1", "right_thumb2", "right_thumb3",
    "jaw", "left_eye", "right_eye",
]


def load_smplx_model():
    """Load SMPL-X model and generate neutral pose mesh."""
    try:
        import torch
        import smplx
    except ImportError:
        print("Error: PyTorch and smplx are required.")
        print("Install with: pip install torch smplx")
        sys.exit(1)

    model_path = MODEL_DIR
    if not (model_path / "SMPLX_NEUTRAL.npz").exists():
        print(f"Error: SMPLX_NEUTRAL.npz not found in {model_path}")
        print("Download from https://smpl-x.is.tue.mpg.de")
        sys.exit(1)

    print("[1/4] Loading SMPL-X model...")
    model = smplx.create(
        str(model_path),
        model_type='smplx',
        gender='neutral',
        use_pca=False,
        flat_hand_mean=True,
    )

    print("[2/4] Generating neutral pose...")
    with torch.no_grad():
        output = model()

    vertices = output.vertices[0].numpy()
    joints = output.joints[0].numpy()[:55]  # first 55 are body+hand+face
    faces = model.faces.astype(np.int32)
    weights = model.lbs_weights.numpy()

    print(f"  Vertices: {vertices.shape[0]}")
    print(f"  Faces: {faces.shape[0]}")
    print(f"  Joints: {joints.shape[0]}")

    return vertices, faces, joints, weights


def build_glb(vertices, faces, joints, weights):
    """Build a GLB file with mesh, skeleton, and skinning."""
    print("[3/4] Building GLB...")

    num_joints = len(JOINT_NAMES)
    num_verts = vertices.shape[0]
    num_faces = faces.shape[0]

    # Compute inverse bind matrices
    ibms = []
    for i in range(num_joints):
        mat = np.eye(4, dtype=np.float32)
        mat[0, 3] = -joints[i, 0]
        mat[1, 3] = -joints[i, 1]
        mat[2, 3] = -joints[i, 2]
        ibms.append(mat)
    ibm_data = np.array(ibms, dtype=np.float32)

    # Compute per-vertex joint indices and weights (max 4 per vertex)
    joint_indices = np.zeros((num_verts, 4), dtype=np.uint16)
    joint_weights_data = np.zeros((num_verts, 4), dtype=np.float32)

    for vi in range(num_verts):
        w = weights[vi]
        # Get top 4 joints by weight
        top4 = np.argsort(w)[-4:][::-1]
        top_w = w[top4]
        # Normalize
        total = top_w.sum()
        if total > 0:
            top_w /= total
        joint_indices[vi] = top4.astype(np.uint16)
        joint_weights_data[vi] = top_w

    # Build binary buffer
    buffers = []

    def add_buffer(data):
        raw = data.tobytes()
        # Pad to 4-byte alignment
        pad = (4 - len(raw) % 4) % 4
        raw += b'\x00' * pad
        offset = sum(len(b) for b in buffers)
        buffers.append(raw)
        return offset, len(data.tobytes())

    # Positions
    pos_offset, pos_size = add_buffer(vertices.astype(np.float32).flatten())
    # Normals (compute flat normals)
    normals = np.zeros_like(vertices, dtype=np.float32)
    for f in faces:
        v0, v1, v2 = vertices[f[0]], vertices[f[1]], vertices[f[2]]
        n = np.cross(v1 - v0, v2 - v0)
        norm = np.linalg.norm(n)
        if norm > 0:
            n /= norm
        normals[f[0]] += n
        normals[f[1]] += n
        normals[f[2]] += n
    norms_len = np.linalg.norm(normals, axis=1, keepdims=True)
    norms_len[norms_len == 0] = 1
    normals /= norms_len
    norm_offset, norm_size = add_buffer(normals.flatten())
    # Indices
    idx_offset, idx_size = add_buffer(faces.astype(np.uint32).flatten())
    # Joint indices
    ji_offset, ji_size = add_buffer(joint_indices.flatten())
    # Joint weights
    jw_offset, jw_size = add_buffer(joint_weights_data.flatten())
    # Inverse bind matrices
    ibm_offset, ibm_size = add_buffer(ibm_data.flatten())

    total_buf_size = sum(len(b) for b in buffers)

    # Bounding box
    pos_min = vertices.min(axis=0).tolist()
    pos_max = vertices.max(axis=0).tolist()

    # Build GLTF JSON
    gltf = {
        "asset": {"version": "2.0", "generator": "sgsl-avatar generate_mesh.py"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [],
        "meshes": [{"primitives": [{"attributes": {
            "POSITION": 0, "NORMAL": 1, "JOINTS_0": 3, "WEIGHTS_0": 4,
        }, "indices": 2, "material": 0}]}],
        "skins": [{"inverseBindMatrices": 5, "joints": list(range(num_joints)),
                    "skeleton": 0}],
        "materials": [{"pbrMetallicRoughness": {
            "baseColorFactor": [0.7, 0.75, 0.85, 1.0],
            "metallicFactor": 0.1, "roughnessFactor": 0.6,
        }, "name": "skin"}],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": num_verts,
             "type": "VEC3", "min": pos_min, "max": pos_max},
            {"bufferView": 1, "componentType": 5126, "count": num_verts, "type": "VEC3"},
            {"bufferView": 2, "componentType": 5125, "count": num_faces * 3, "type": "SCALAR"},
            {"bufferView": 3, "componentType": 5123, "count": num_verts, "type": "VEC4"},
            {"bufferView": 4, "componentType": 5126, "count": num_verts, "type": "VEC4"},
            {"bufferView": 5, "componentType": 5126, "count": num_joints, "type": "MAT4"},
        ],
        "bufferViews": [
            {"buffer": 0, "byteOffset": pos_offset, "byteLength": pos_size},
            {"buffer": 0, "byteOffset": norm_offset, "byteLength": norm_size},
            {"buffer": 0, "byteOffset": idx_offset, "byteLength": idx_size,
             "target": 34963},
            {"buffer": 0, "byteOffset": ji_offset, "byteLength": ji_size},
            {"buffer": 0, "byteOffset": jw_offset, "byteLength": jw_size},
            {"buffer": 0, "byteOffset": ibm_offset, "byteLength": ibm_size},
        ],
        "buffers": [{"byteLength": total_buf_size}],
    }

    # Build joint nodes
    # Nodes: 0 = root mesh+skin, 1-55 = joints
    mesh_node = {
        "mesh": 0,
        "skin": 0,
        "name": "smplx_body",
        "children": [1],  # pelvis bone
    }
    gltf["nodes"].append(mesh_node)

    for i in range(num_joints):
        node = {"name": JOINT_NAMES[i]}
        # Translation relative to parent
        if SMPLX_PARENT[i] >= 0:
            parent_pos = joints[SMPLX_PARENT[i]]
            rel = joints[i] - parent_pos
        else:
            rel = joints[i]
        node["translation"] = rel.tolist()
        # Find children
        children = [j + 1 for j in range(num_joints) if SMPLX_PARENT[j] == i]
        if children:
            node["children"] = children
        gltf["nodes"].append(node)

    # Update skin joint indices (offset by 1 since node 0 is the mesh)
    gltf["skins"][0]["joints"] = list(range(1, num_joints + 1))
    gltf["skins"][0]["skeleton"] = 1

    # Serialize to GLB
    gltf_json = json.dumps(gltf, separators=(',', ':')).encode('utf-8')
    # Pad JSON to 4 bytes
    json_pad = (4 - len(gltf_json) % 4) % 4
    gltf_json += b' ' * json_pad

    bin_data = b''.join(buffers)

    # GLB header
    total_length = 12 + 8 + len(gltf_json) + 8 + len(bin_data)

    output = bytearray()
    # Header
    output += struct.pack('<4sII', b'glTF', 2, total_length)
    # JSON chunk
    output += struct.pack('<II', len(gltf_json), 0x4E4F534A)  # JSON
    output += gltf_json
    # BIN chunk
    output += struct.pack('<II', len(bin_data), 0x004E4942)  # BIN
    output += bin_data

    return bytes(output)


def main():
    vertices, faces, joints, weights = load_smplx_model()
    glb_data = build_glb(vertices, faces, joints, weights)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, 'wb') as f:
        f.write(glb_data)

    size_mb = len(glb_data) / 1024 / 1024
    print(f"[4/4] Written: {OUTPUT_PATH} ({size_mb:.1f} MB)")
    print("\nDone! Refresh your browser to see the SMPL-X mesh.")


if __name__ == "__main__":
    main()
