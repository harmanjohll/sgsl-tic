/* ============================================================
   SgSL Avatar — Quality Gate
   ============================================================
   Analyzes recorded landmark sequences for data quality.
   Provides per-frame and overall scores for:
   - Landmark completeness (are all required points present?)
   - Tracking confidence (MediaPipe visibility scores)
   - Temporal stability / jitter (is tracking stable?)
   - Body framing (is the signer properly in frame?)

   Designed to store scores alongside sign data for future
   ML training (quality classifiers, confidence weighting).
   ============================================================ */

export class QualityGate {
  /**
   * Analyze a recorded sequence of holistic frames.
   * @param {Array} frames - [{leftHand, rightHand, face, pose, confidence}, ...]
   * @returns {Object} Quality report
   */
  static analyze(frames) {
    if (!frames || !frames.length) {
      return { overall: 0, grade: 'F', pass: false, details: {}, message: 'No frames recorded.' };
    }

    const details = {
      frameCount: frames.length,
      duration: (frames.length / 30).toFixed(1) + 's',
      rightHand: this._analyzeChannel(frames, 'rightHand', 21),
      leftHand: this._analyzeChannel(frames, 'leftHand', 21),
      pose: this._analyzeChannel(frames, 'pose', 33),
      face: this._analyzeChannel(frames, 'face', 32),
      jitter: this._analyzeJitter(frames),
      framing: this._analyzeFraming(frames),
    };

    // Weighted overall score
    // Pose and at least one hand are essential for sign language
    const weights = {
      rightHand: 0.25,
      leftHand: 0.10,
      pose: 0.30,
      face: 0.10,
      jitter: 0.15,
      framing: 0.10,
    };

    let overall = 0;
    for (const [key, weight] of Object.entries(weights)) {
      const score = details[key]?.score ?? 0;
      overall += score * weight;
    }

    // Bonus: if both hands present, boost score
    if (details.rightHand.completeness > 0.5 && details.leftHand.completeness > 0.5) {
      overall = Math.min(1, overall + 0.05);
    }

    const grade = overall >= 0.85 ? 'A' : overall >= 0.7 ? 'B' : overall >= 0.5 ? 'C' : overall >= 0.3 ? 'D' : 'F';
    const pass = overall >= 0.5;

    const issues = [];
    if (details.pose.completeness < 0.5) issues.push('Pose landmarks missing in many frames — ensure full upper body is visible');
    if (details.rightHand.completeness < 0.3 && details.leftHand.completeness < 0.3) issues.push('No hands detected — check lighting and hand visibility');
    if (details.jitter.score < 0.5) issues.push('High jitter detected — try steadier movements or better lighting');
    if (details.framing.score < 0.5) issues.push('Poor framing — center yourself in the camera');
    if (frames.length < 10) issues.push('Too few frames — hold the sign longer');

    return {
      overall: Math.round(overall * 100),
      grade,
      pass,
      details,
      issues,
      message: pass ? `Quality: ${grade} (${Math.round(overall * 100)}%)` : `Quality too low: ${grade} (${Math.round(overall * 100)}%). ${issues[0] || 'Try again.'}`,
    };
  }

  /**
   * Analyze a single landmark channel (hand, pose, or face).
   */
  static _analyzeChannel(frames, channel, expectedPoints) {
    let present = 0;
    let totalConfidence = 0;
    let confCount = 0;

    for (const frame of frames) {
      const data = frame[channel];
      if (data && Array.isArray(data) && data.length >= expectedPoints * 0.5) {
        present++;
        // If confidence data is embedded (4th element per landmark)
        for (const pt of data) {
          if (pt && pt.length >= 4) {
            totalConfidence += pt[3]; // visibility/confidence
            confCount++;
          }
        }
      }
    }

    const completeness = present / frames.length;
    const avgConfidence = confCount > 0 ? totalConfidence / confCount : (completeness > 0 ? 0.7 : 0);
    const score = completeness * 0.6 + avgConfidence * 0.4;

    return {
      completeness: Math.round(completeness * 100) / 100,
      avgConfidence: Math.round(avgConfidence * 100) / 100,
      framesPresent: present,
      framesTotal: frames.length,
      score: Math.round(score * 100) / 100,
    };
  }

  /**
   * Analyze temporal stability (jitter/noise).
   * Low jitter = smooth tracking. High jitter = noisy/unreliable.
   */
  static _analyzeJitter(frames) {
    let totalJitter = 0;
    let jitterCount = 0;

    for (let i = 1; i < frames.length; i++) {
      // Check right hand jitter (most common)
      const prev = frames[i - 1].rightHand;
      const curr = frames[i].rightHand;
      if (prev && curr && prev.length >= 21 && curr.length >= 21) {
        let frameJitter = 0;
        for (let p = 0; p < 21; p++) {
          const dx = (curr[p][0] - prev[p][0]);
          const dy = (curr[p][1] - prev[p][1]);
          frameJitter += Math.sqrt(dx * dx + dy * dy);
        }
        totalJitter += frameJitter / 21;
        jitterCount++;
      }
    }

    if (jitterCount === 0) return { avgJitter: 0, score: 0 };

    const avgJitter = totalJitter / jitterCount;
    // Good tracking: avg landmark movement < 0.01 per frame
    // Bad tracking: > 0.05 per frame
    const score = Math.max(0, Math.min(1, 1 - (avgJitter - 0.005) / 0.04));

    return {
      avgJitter: Math.round(avgJitter * 1000) / 1000,
      score: Math.round(score * 100) / 100,
    };
  }

  /**
   * Analyze body framing (is the signer centered and properly sized?).
   */
  static _analyzeFraming(frames) {
    let centered = 0;
    let properSize = 0;
    let total = 0;

    for (const frame of frames) {
      const pose = frame.pose;
      if (!pose || pose.length < 16) continue;

      total++;
      // Check shoulders are visible (landmarks 11, 12)
      const ls = pose[11];
      const rs = pose[12];
      if (!ls || !rs) continue;

      // Centered: shoulder midpoint near x=0.5
      const midX = (ls[0] + rs[0]) / 2;
      if (Math.abs(midX - 0.5) < 0.2) centered++;

      // Proper size: shoulder width between 0.1 and 0.5 of frame
      const shoulderWidth = Math.abs(ls[0] - rs[0]);
      if (shoulderWidth > 0.08 && shoulderWidth < 0.5) properSize++;
    }

    if (total === 0) return { score: 0.3 }; // no pose = uncertain

    const centerScore = centered / total;
    const sizeScore = properSize / total;
    const score = centerScore * 0.5 + sizeScore * 0.5;

    return {
      centeredRatio: Math.round(centerScore * 100) / 100,
      properSizeRatio: Math.round(sizeScore * 100) / 100,
      score: Math.round(score * 100) / 100,
    };
  }
}
