import type { NightConfig, DeviceKind } from '../../../contracts';
import type { WorldCamera, WorldCameraOptions, WorldDevice } from './worldTypes';
export const WORLD_PROJECTION_Y = .7;
export interface SpriteSpec { frame: { x:number; y:number; width:number; height:number }; width:number; height:number; anchorX:number; anchorY:number }
/** Source frames and presentation sizes from world-v2/scene-data.json. */
export const WORLD_SPRITES: Record<'lighthouse'|'cannon'|'barrier'|'pier',SpriteSpec> = {
 lighthouse:{frame:{x:257,y:84,width:502,height:1337},width:71.33881824981302,height:190,anchorX:.5,anchorY:.91},
 cannon:{frame:{x:113,y:212,width:401,height:268},width:74,height:49.45635910224439,anchorX:.65,anchorY:.97},
 barrier:{frame:{x:798,y:182,width:287,height:284},width:60,height:59.37282229965157,anchorX:.5,anchorY:.84},
 pier:{frame:{x:16,y:851,width:600,height:246},width:145,height:59.45,anchorX:.24,anchorY:.6},
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
 const definition=config.devices.definitions[device.kind];
 const radius=device.kind==='light-trap'?config.devices.trap.triggerRadius:Math.max(definition.radius,definition.range);
 return {x:device.x,y:device.y,radius};
}
export function deviceSprite(kind:DeviceKind):SpriteSpec|undefined { return kind==='cannon'||kind==='barrier'?WORLD_SPRITES[kind]:undefined; }
export function createWorldCamera(config:NightConfig,width:number,height:number,options:WorldCameraOptions={}):WorldCamera {
 const v=options.viewport??{x:0,y:0,width,height};
 const padding=Math.min(options.padding??24,Math.max(0,(Math.min(v.width,v.height)-1)/2));
 const devices=options.devices??[], selected=options.selected;
 const objects=[spriteBounds(0,0,WORLD_SPRITES.lighthouse),spriteBounds(0,110,WORLD_SPRITES.pier),...devices.map(d=>{const s=deviceSprite(d.kind);return s?spriteBounds(d.x,d.y,s):{minX:d.x-24,maxX:d.x+24,minY:d.y*WORLD_PROJECTION_Y-48,maxY:d.y*WORLD_PROJECTION_Y+10};})];
 const selectedArea=selected?deviceArea(config,selected):null;
 let bounds=union([circle(0,0,config.beam.range),circle(0,0,config.spawnRadius),...objects,...(selectedArea?[circle(selectedArea.x,selectedArea.y,selectedArea.radius)]:[])]);
 const fit=(b:ProjectedBounds,maxZoom=Infinity):WorldCamera=>{
  const zoom=Math.max(.001,Math.min((v.width-2*padding)/(b.maxX-b.minX),(v.height-2*padding)/(b.maxY-b.minY),maxZoom));
  return {width,height,x:v.x+v.width/2-(b.minX+b.maxX)/2*zoom,y:v.y+v.height/2-(b.minY+b.maxY)/2*zoom,zoom,projectionY:WORLD_PROJECTION_Y};
 };
 const overview=fit(bounds,.9001956947162427);
 if(options.mode==='battle') { bounds=union([bounds,circle(0,0,config.worldRadius)]);return fit(bounds,overview.zoom); }
 if(options.mode==='close') {
  const area=selectedArea??{x:0,y:0,radius:config.shield.radius};
  return fit(union([circle(area.x,area.y,area.radius),selected?(deviceSprite(selected.kind)?spriteBounds(selected.x,selected.y,deviceSprite(selected.kind)!):circle(selected.x,selected.y,48)):objects[0]!]));
 }
 return overview;
}
export function worldToScreen(camera:WorldCamera,x:number,y:number):{x:number;y:number} {return {x:camera.x+x*camera.zoom,y:camera.y+y*camera.zoom*camera.projectionY};}
export function screenToWorld(camera:WorldCamera,x:number,y:number):{x:number;y:number} {return {x:(x-camera.x)/camera.zoom,y:(y-camera.y)/(camera.zoom*camera.projectionY)};}
