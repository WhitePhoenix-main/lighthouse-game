import type { NightConfig, DeviceKind } from '../../../contracts';
import { effectiveWeaponDefinition } from '../../../content/campaignVariants';
import type { WorldCamera, WorldCameraOptions, WorldDevice } from './worldTypes';
export const WORLD_PROJECTION_Y = .7;
export const HEADLAND_WORLD_PER_PIXEL = 2.05;
export interface SpriteSpec { frame: { x:number; y:number; width:number; height:number }; width:number; height:number; anchorX:number; anchorY:number }
/** Source frames and presentation sizes from world-v2/scene-data.json. */
export const WORLD_SPRITES: Record<'lighthouse'|'cannon'|'barrier'|'pier',SpriteSpec> = {
 lighthouse:{frame:{x:257,y:84,width:502,height:1337},width:71.33881824981302,height:190,anchorX:.5,anchorY:.91},
 cannon:{frame:{x:113,y:212,width:401,height:268},width:74,height:49.45635910224439,anchorX:.65,anchorY:.97},
 barrier:{frame:{x:798,y:182,width:287,height:284},width:60,height:59.37282229965157,anchorX:.5,anchorY:.84},
 pier:{frame:{x:16,y:851,width:600,height:246},width:145,height:59.45,anchorX:.24,anchorY:.6},
};
function watchSprite(width: number, height: number, scale: number, anchorX = .5, anchorY = .8): SpriteSpec {
  return { frame: { x: 0, y: 0, width, height }, width: width * scale, height: height * scale, anchorX, anchorY };
}

export const WATCH_BEACON = watchSprite(80, 124, HEADLAND_WORLD_PER_PIXEL, 40 / 80, 119 / 124);
export const WATCH_DEVICE_SPRITES: Record<DeviceKind, SpriteSpec & { image: string }> = {
  cannon: { ...watchSprite(36, 30, HEADLAND_WORLD_PER_PIXEL, 17 / 36, 26 / 30), image: 'shore-cannon' },
  barrier: { ...watchSprite(39, 26, HEADLAND_WORLD_PER_PIXEL, 22 / 39, 20 / 26), image: 'palisade' },
  generator: { ...watchSprite(38, 40, 1.5), image: 'generator' },
  'light-trap': { ...watchSprite(38, 40, 1.5), image: 'light-trap' },
  harpoon: { ...watchSprite(38, 40, 1.5), image: 'harpoon' },
  mortar: { ...watchSprite(38, 40, 1.5), image: 'mortar' },
  bell: { ...watchSprite(38, 40, 1.5), image: 'bell' },
  'repair-lamp': { ...watchSprite(38, 40, 1.5), image: 'repair-lamp' },
};
export interface ProjectedBounds { minX:number; maxX:number; minY:number; maxY:number }
export function spriteBounds(x:number,y:number,spec:SpriteSpec):ProjectedBounds {
 const scale=Math.min(spec.width/spec.frame.width,spec.height/spec.frame.height), width=spec.frame.width*scale,height=spec.frame.height*scale;
 return {minX:x-width*spec.anchorX,maxX:x+width*(1-spec.anchorX),minY:y*WORLD_PROJECTION_Y-height*spec.anchorY,maxY:y*WORLD_PROJECTION_Y+height*(1-spec.anchorY)};
}
const union=(bounds:ProjectedBounds[]):ProjectedBounds=>({ minX:Math.min(...bounds.map(b=>b.minX)),maxX:Math.max(...bounds.map(b=>b.maxX)),minY:Math.min(...bounds.map(b=>b.minY)),maxY:Math.max(...bounds.map(b=>b.maxY)) });
const circle=(x:number,y:number,r:number):ProjectedBounds=>({minX:x-r,maxX:x+r,minY:(y-r)*WORLD_PROJECTION_Y,maxY:(y+r)*WORLD_PROJECTION_Y});
export function deviceArea(config:NightConfig,device:WorldDevice):{x:number;y:number;radius:number} {
 if(device.kind==='generator') return {x:0,y:0,radius:config.shield.radius};
 const definition=effectiveWeaponDefinition(config,device);
 const radius=device.kind==='light-trap'?config.devices.trap.triggerRadius:Math.max(definition.radius,definition.range);
 return {x:device.x,y:device.y,radius};
}
export function deviceSprite(kind: DeviceKind): SpriteSpec { return WATCH_DEVICE_SPRITES[kind]; }
export function createWorldCamera(config:NightConfig,width:number,height:number,options:WorldCameraOptions={}):WorldCamera {
 const v=options.viewport??{x:0,y:0,width,height};
 const fullHeadland = !options.viewport && config.campaignMapId === 'headland' && options.mode !== 'close';
 const riftOverview = !options.viewport && config.campaignMapId === 'rift-coast' && options.mode !== 'close';
 const padding=Math.min(options.padding??(fullHeadland ? 12 : 24),Math.max(0,(Math.min(v.width,v.height)-1)/2));
 const devices=options.devices??[], selected=options.selected;
 const objects=[spriteBounds(0,0,WATCH_BEACON),spriteBounds(0,110,WORLD_SPRITES.pier),...devices.map(d=>spriteBounds(d.x,d.y,deviceSprite(d.kind)))];
 const selectedArea=selected?deviceArea(config,selected):null;
 let bounds=union([circle(0,0,config.beam.range),circle(0,0,config.spawnRadius),...objects,...(selectedArea&&!riftOverview?[circle(selectedArea.x,selectedArea.y,selectedArea.radius)]:[])]);
 if (riftOverview) {
  bounds = union([bounds, circle(0, 0, config.worldRadius)]);
  // The common frame reserves space for the top row and the larger action row.
  // Local HUD panels can grow without moving the field under a held pointer.
  const top = height * .14;
  const bottom = height * .17;
  const zoom = Math.max(.001, Math.min(.78,
   (width - 2 * padding) / (bounds.maxX - bounds.minX),
   (height - top - bottom) / (bounds.maxY - bounds.minY)));
  return { width, height, zoom, projectionY: WORLD_PROJECTION_Y,
   x: width / 2 - (bounds.minX + bounds.maxX) / 2 * zoom,
   y: (height + top - bottom) / 2 - (bounds.minY + bounds.maxY) / 2 * zoom };
 }
 const fit=(b:ProjectedBounds,maxZoom=Infinity):WorldCamera=>{
  const projectedWidth = b.maxX - b.minX;
  const zoom=Math.max(.001,Math.min((v.width-2*padding)/projectedWidth,(v.height-2*padding)/(b.maxY-b.minY),maxZoom));
  if (fullHeadland) {
   const clamp = (center: number, start: number, extent: number, min: number, max: number) =>
    Math.max(start + padding - min * zoom, Math.min(start + extent - padding - max * zoom, center));
   return { width, height, zoom, projectionY: WORLD_PROJECTION_Y,
    x: clamp(width * .56, v.x, v.width, b.minX, b.maxX),
    y: clamp(height * (height > width ? .52 : .585), v.y, v.height, b.minY, b.maxY) };
  }
  // Extra horizontal room shows more of the two land approaches in wide views.
  const room = Math.max(0, v.width - 2 * padding - projectedWidth * zoom);
  const showApproaches = options.mode !== 'close' && (!config.campaignMapId || config.campaignMapId === 'headland');
  const shoreOffset = showApproaches ? Math.min(v.width * .06, room / 2) : 0;
  return {width,height,x:v.x+v.width/2+shoreOffset-(b.minX+b.maxX)/2*zoom,y:v.y+v.height/2-(b.minY+b.maxY)/2*zoom,zoom,projectionY:WORLD_PROJECTION_Y};
 };
 const plateScale = height > width ? .77 * Math.min(width / 360, height / 640) : Math.min(width / 640, height / 360);
 const maxOverviewZoom = fullHeadland ? plateScale / HEADLAND_WORLD_PER_PIXEL : .9;
 if(options.mode==='battle' || fullHeadland) bounds=union([bounds,circle(0,0,config.worldRadius)]);
 if(options.mode==='close') {
  const area=selectedArea??{x:0,y:0,radius:config.shield.radius};
  return fit(union([circle(area.x,area.y,area.radius),selected?spriteBounds(selected.x,selected.y,deviceSprite(selected.kind)):objects[0]!]));
 }
 return fit(bounds,maxOverviewZoom);
}
export function worldToScreen(camera:WorldCamera,x:number,y:number):{x:number;y:number} {return {x:camera.x+x*camera.zoom,y:camera.y+y*camera.zoom*camera.projectionY};}
export function screenToWorld(camera:WorldCamera,x:number,y:number):{x:number;y:number} {return {x:(x-camera.x)/camera.zoom,y:(y-camera.y)/(camera.zoom*camera.projectionY)};}
