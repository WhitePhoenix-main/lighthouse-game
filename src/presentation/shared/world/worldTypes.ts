import type { DeviceKind, NightConfig } from '../../../contracts';

export interface WorldViewport { x: number; y: number; width: number; height: number }
export interface WorldCamera {
  width: number; height: number;
  /** Screen coordinates of world (0,0), in CSS pixels. */
  x: number; y: number;
  zoom: number;
  projectionY: number;
}
export interface WorldDevice {
  id: number; kind: DeviceKind; x: number; y: number;
  health?: number; maxHealth?: number; consumed?: boolean;
}
export interface ChapterWorldAssets {
  terrain: HTMLImageElement;
  lighthouse: HTMLImageElement;
  props: HTMLImageElement;
}
export interface WorldPaintOptions {
  devices: readonly WorldDevice[];
  /** Presentation overlays between the terrain and all world sprites. */
  paintGround?: (ctx: CanvasRenderingContext2D) => void;
  selectedDeviceId?: number | null;
  showRanges?: boolean;
  preview?: { x: number; y: number; valid: boolean; kind: DeviceKind } | null;
  drawLighthouse?: boolean;
  drawDevices?: boolean;
  /** Battle keeps its existing collision-free health indicator layer. */
  showHealthBars?: boolean;
}
export interface WorldCameraOptions {
  viewport?: WorldViewport;
  mode?: 'overview' | 'close' | 'battle';
  selected?: WorldDevice | null;
  devices?: readonly WorldDevice[];
  padding?: number;
}
export type WorldConfig = NightConfig;
