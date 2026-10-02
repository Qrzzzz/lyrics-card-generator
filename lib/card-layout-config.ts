import type { CardLayoutMode } from "@/lib/types";

export type LayoutMode = CardLayoutMode;

export type CardLayoutConfig = {
  canvas: {
    defaultWidth: number;
    defaultHeight: number;
    minWidth: number;
    maxWidth: number;
    minHeight: number;
    maxHeight: number;
  };
  padding: {
    outerX: number;
    outerY: number;
    contentX: number;
    contentY: number;
  };
  frame: {
    radius: number;
    paddingX: number;
    paddingY: number;
    borderWidth: number;
    shadowStrength: "none" | "soft" | "medium" | "strong";
  };
  header: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  cover: {
    x: number;
    y: number;
    size: number;
  };
  songInfo: {
    x: number;
    y: number;
    width: number;
  };
  lyrics: {
    x: number;
    y: number;
    width: number;
    maxHeight: number;
  };
  footer: {
    topRowBottom: number;
    generatedBottom: number;
    sideInset: number;
    generatedWidth: number;
  };
};

export const portraitLayoutConfig: CardLayoutConfig = {
  canvas: {
    defaultWidth: 1080,
    defaultHeight: 1350,
    minWidth: 720,
    maxWidth: 1440,
    minHeight: 720,
    maxHeight: 3200
  },
  padding: {
    outerX: 72,
    outerY: 72,
    contentX: 54,
    contentY: 54
  },
  frame: {
    radius: 48,
    paddingX: 54,
    paddingY: 54,
    borderWidth: 1,
    shadowStrength: "strong"
  },
  header: {
    x: 0,
    y: 0,
    width: 900,
    height: 150
  },
  cover: {
    x: 0,
    y: 0,
    size: 124
  },
  songInfo: {
    x: 0,
    y: 0,
    width: 780
  },
  lyrics: {
    x: 0,
    y: 0,
    width: 900,
    maxHeight: 900
  },
  footer: {
    topRowBottom: 96,
    generatedBottom: 48,
    sideInset: 54,
    generatedWidth: 760
  }
};
