/**
 * Hand tracking via MediaPipe Tasks Vision (HandLandmarker).
 *
 * Loads the model once, then on each video frame returns the detected hands
 * as normalized [0..1] landmark coordinates. The game layer decides how to
 * map those into (mirrored) canvas space.
 *
 * Landmark index reference (per hand, 21 points):
 *   0 wrist · 4 thumb tip · 8 index tip · 12 middle tip · 16 ring tip · 20 pinky tip
 * We mostly care about fingertips for slicing.
 */
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

export interface Landmark {
  x: number; // normalized 0..1 (left→right in the RAW, unmirrored video)
  y: number; // normalized 0..1 (top→bottom)
  z: number; // relative depth
}

export type Hand = Landmark[]; // 21 landmarks

// Fingertip landmark indices we track for slicing.
export const FINGERTIPS = [4, 8, 12, 16, 20] as const;
export const INDEX_TIP = 8;

export class HandTracker {
  private landmarker: HandLandmarker | null = null;
  private lastVideoTime = -1;
  hands: Hand[] = [];

  async init(): Promise<void> {
    // WASM runtime is pulled from the CDN (matches the installed package line).
    const fileset = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/wasm"
    );

    this.landmarker = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  }

  /** Run detection for the current video frame. Safe to call every rAF. */
  detect(video: HTMLVideoElement, nowMs: number): void {
    if (!this.landmarker) return;
    // detectForVideo requires a monotonically increasing timestamp and a new frame.
    if (video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = video.currentTime;

    const result = this.landmarker.detectForVideo(video, nowMs);
    this.hands = (result.landmarks ?? []) as Hand[];
  }
}
