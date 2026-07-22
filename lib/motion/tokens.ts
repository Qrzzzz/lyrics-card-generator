import type { Transition, Variants } from "framer-motion";

export const motionDurations = {
  fast: 0.14,
  normal: 0.2,
  slow: 0.32
} as const;

export const motionEasings = {
  standard: [0.22, 1, 0.36, 1],
  emphasized: [0.16, 1, 0.3, 1]
} as const;

export const motionSprings = {
  control: { type: "spring", stiffness: 520, damping: 38, mass: 0.72 },
  panel: { type: "spring", stiffness: 360, damping: 34, mass: 0.86 },
  dialog: { type: "spring", stiffness: 300, damping: 32, mass: 0.88 }
} as const satisfies Record<string, Transition>;

export const controlHoverTarget = { y: -1 } as const;

export const controlTapTarget = { scale: 0.985 } as const;

export const subtleControlTapTarget = { scale: 0.992 } as const;

export type StepDirection = 1 | -1;

export function opacityOnlyVariants(): Variants {
  return {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 }
  };
}

export function panelVariants(reducedMotion = false): Variants {
  if (reducedMotion) {
    return {
      initial: { opacity: 0, y: 0 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: 0 }
    };
  }

  return {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 8 }
  };
}

export function dialogOverlayVariants(): Variants {
  return {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 }
  };
}

export function dialogPanelVariants(reducedMotion = false): Variants {
  if (reducedMotion) {
    return {
      initial: { opacity: 0, scale: 1, y: 0 },
      animate: { opacity: 1, scale: 1, y: 0 },
      exit: { opacity: 0, scale: 1, y: 0 }
    };
  }

  return {
    initial: { opacity: 0, scale: 0.97, y: 14 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.985, y: 8 }
  };
}

export function tabPanelVariants(reducedMotion = false): Variants {
  if (reducedMotion) {
    return {
      initial: { opacity: 0, x: 0 },
      animate: { opacity: 1, x: 0 },
      exit: { opacity: 0, x: 0 }
    };
  }

  return {
    initial: { opacity: 0, x: 10 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -8 }
  };
}

export function stepPanelVariants(reducedMotion = false): Variants {
  if (reducedMotion) {
    return {
      initial: { opacity: 0, x: 0 },
      animate: { opacity: 1, x: 0 },
      exit: { opacity: 0, x: 0 }
    };
  }

  return {
    initial: (direction: StepDirection) => ({ opacity: 0, x: direction > 0 ? 18 : -18 }),
    animate: { opacity: 1, x: 0 },
    exit: (direction: StepDirection) => ({ opacity: 0, x: direction > 0 ? -18 : 18 })
  };
}

export function workbenchStepPanelVariants(reducedMotion = false): Variants {
  if (reducedMotion) {
    return {
      initial: { opacity: 0, x: 0 },
      animate: { opacity: 1, x: 0 },
      exit: { opacity: 0, x: 0 }
    };
  }

  return {
    initial: (direction: StepDirection) => ({ opacity: 0, x: direction > 0 ? 72 : -72 }),
    animate: { opacity: 1, x: 0 },
    exit: (direction: StepDirection) => ({ opacity: 0, x: direction > 0 ? -72 : 72 })
  };
}

export const opacityTransition: Transition = {
  duration: motionDurations.normal,
  ease: motionEasings.standard
};

export const panelTransition: Transition = {
  duration: motionDurations.slow,
  ease: motionEasings.emphasized
};

export const reducedMotionTransition: Transition = {
  duration: 0
};
