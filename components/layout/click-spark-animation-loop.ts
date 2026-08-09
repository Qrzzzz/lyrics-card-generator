type ClickSparkAnimationLoopOptions = {
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (frameId: number) => void;
  canAnimate: () => boolean;
  drawFrame: (timestamp: number) => boolean;
  resetFrame: () => void;
};

export type ClickSparkAnimationLoop = {
  start: () => void;
  stop: (reset?: boolean) => void;
  dispose: () => void;
  isRunning: () => boolean;
};

export function createClickSparkAnimationLoop({
  requestFrame,
  cancelFrame,
  canAnimate,
  drawFrame,
  resetFrame
}: ClickSparkAnimationLoopOptions): ClickSparkAnimationLoop {
  let frameId: number | null = null;
  let disposed = false;
  let generation = 0;

  const schedule = () => {
    if (disposed || !canAnimate() || frameId !== null) {
      return;
    }

    const scheduledGeneration = generation;
    frameId = requestFrame((timestamp) => draw(timestamp, scheduledGeneration));
  };

  const draw = (timestamp: number, scheduledGeneration: number) => {
    if (scheduledGeneration !== generation) {
      return;
    }

    frameId = null;

    // A setting can change after a frame was queued but before its callback runs.
    if (disposed) {
      return;
    }

    if (!canAnimate()) {
      resetFrame();
      return;
    }

    if (drawFrame(timestamp)) {
      schedule();
    }
  };

  const stop = (reset = false) => {
    generation += 1;

    if (frameId !== null) {
      cancelFrame(frameId);
      frameId = null;
    }

    if (reset) {
      resetFrame();
    }
  };

  return {
    start: schedule,
    stop,
    dispose() {
      disposed = true;
      stop();
    },
    isRunning() {
      return frameId !== null;
    }
  };
}
