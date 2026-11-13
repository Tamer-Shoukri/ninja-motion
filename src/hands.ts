/**
 * Hand tracking via MediaPipe Tasks Vision (HandLandmarker), fully on-device.
 *
 * Returns each detected hand with a stable id from MediaPipe's handedness
 * label ("Left"/"Right"), so the game can keep one blade per physical hand.
 * Keying by list position instead would swap blades whenever the two hands
 * swap order between frames, producing phantom cuts across the screen.
 *
 * Landmarks: 0 wrist · 4 thumb tip · 8 index tip · 12 middle tip.
 */
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

export interface Landmark {
  x: number; // normalized 0..1 in the RAW (unmirrored) video
  y: number;
  z: number;
}

export interface TrackedHand {
  id: string;
  landmarks: Landmark[];
}

export const INDEX_TIP = 8;
export const MIDDLE_TIP = 12;

export class HandTracker {
  private landmarker: HandLandmarker | null = null;
  private lastVideoTime = -1;
  hands: TrackedHand[] = [];

  async init(): Promise<void> {
    const fileset = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/wasm");
    const options = (delegate: "GPU" | "CPU") => ({
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        delegate,
      },
      runningMode: "VIDEO" as const,
      numHands: 2,
      minHandDetectionConfidence: 0.4,
      minHandPresenceConfidence: 0.4,
      minTrackingConfidence: 0.3,
    });
    try {
      this.landmarker = await HandLandmarker.createFromOptions(fileset, options("GPU"));
    } catch {
      // Some machines/browsers lack WebGL2 for the GPU delegate; CPU still works.
      this.landmarker = await HandLandmarker.createFromOptions(fileset, options("CPU"));
    }
  }

  get ready(): boolean {
    return this.landmarker !== null;
  }

  /**
   * Run detection if the video has a new frame. Returns true when `hands` was
   * refreshed (so callers only feed genuinely new samples to the slicer).
   */
  detect(video: HTMLVideoElement, nowMs: number): boolean {
    if (!this.landmarker || video.readyState < 2) return false;
    if (video.currentTime === this.lastVideoTime) return false;
    this.lastVideoTime = video.currentTime;
    const result = this.landmarker.detectForVideo(video, nowMs);
    const seen = new Map<string, number>();
    this.hands = (result.landmarks ?? []).map((landmarks, i) => {
      const label = result.handedness?.[i]?.[0]?.categoryName ?? `h${i}`;
      const n = seen.get(label) ?? 0;
      seen.set(label, n + 1);
      return { id: n === 0 ? label : `${label}${n}`, landmarks: landmarks as Landmark[] };
    });
    return true;
  }
}
