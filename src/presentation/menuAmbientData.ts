export const MENU_AMBIENT_LAYERS = [
  { id: 'clouds-upper', file: 'clouds-upper.png', rect: [0, 0, 640, 100], frames: 8, frameMs: 330, phaseMs: 0 },
  { id: 'clouds-lower', file: 'clouds-lower.png', rect: [0, 100, 640, 230], frames: 8, frameMs: 360, phaseMs: 330 },
  { id: 'waves-upper', file: 'waves-upper.png', rect: [0, 330, 640, 105], frames: 8, frameMs: 180, phaseMs: 0 },
  { id: 'waves-middle', file: 'waves-middle.png', rect: [0, 435, 640, 105], frames: 8, frameMs: 180, phaseMs: 360 },
  { id: 'waves-lower', file: 'waves-lower.png', rect: [0, 540, 640, 100], frames: 8, frameMs: 180, phaseMs: 720 },
  { id: 'grass-left', file: 'grass-left.png', rect: [1, 444, 105, 52], frames: 8, frameMs: 210, phaseMs: 0 },
  { id: 'grass-stone', file: 'grass-stone.png', rect: [140, 400, 55, 48], frames: 8, frameMs: 210, phaseMs: 210 },
  { id: 'grass-center', file: 'grass-center.png', rect: [207, 388, 80, 81], frames: 8, frameMs: 210, phaseMs: 420 },
  { id: 'grass-slope', file: 'grass-slope.png', rect: [258, 349, 70, 40], frames: 8, frameMs: 210, phaseMs: 630 },
  { id: 'grass-front-left', file: 'grass-front-left.png', rect: [9, 546, 70, 52], frames: 8, frameMs: 210, phaseMs: 840 },
  { id: 'grass-front-center', file: 'grass-front-center.png', rect: [198, 583, 47, 40], frames: 8, frameMs: 210, phaseMs: 1050 },
  { id: 'grass-front-right', file: 'grass-front-right.png', rect: [581, 588, 58, 48], frames: 8, frameMs: 210, phaseMs: 1260 },
] as const;
