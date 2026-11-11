/**
 * Webcam helper — requests the camera and streams it into a <video> element.
 * Kept separate so the game loop never has to know about getUserMedia details.
 */

export interface WebcamHandle {
  video: HTMLVideoElement;
  width: number;
  height: number;
}

export async function startWebcam(video: HTMLVideoElement): Promise<WebcamHandle> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser does not support camera access (getUserMedia).");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: "user",
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  });

  video.srcObject = stream;
  await video.play();

  // Wait until the video actually has dimensions before anyone reads them.
  await new Promise<void>((resolve) => {
    if (video.videoWidth > 0) return resolve();
    video.addEventListener("loadeddata", () => resolve(), { once: true });
  });

  return {
    video,
    width: video.videoWidth,
    height: video.videoHeight,
  };
}
