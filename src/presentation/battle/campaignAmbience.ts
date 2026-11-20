import type { GameApplication } from '../../contracts';
import type { CampaignMap } from '../shared/world/chapterScenery';
import type { EffectsAudioEnvironment } from './effectsAudio';

type Tone = readonly [wave: OscillatorType, hertz: number, level: number];

// Original, quiet chord beds. Close partials beat slowly in place of a sampled loop.
const TIMBRES: Record<CampaignMap, readonly Tone[]> = {
  headland: [['sine', 73.4, .07], ['triangle', 110, .023], ['sine', 111.2, .025]],
  sandspit: [['triangle', 65.4, .045], ['sine', 98, .035], ['sine', 131.9, .018]],
  'marsh-islands': [['sine', 55, .065], ['sine', 58.3, .035], ['triangle', 82.4, .019]],
  'ashen-plateau': [['triangle', 49, .048], ['triangle', 74.1, .028], ['sine', 147, .014]],
  'wreck-channel': [['sine', 61.7, .058], ['triangle', 92.5, .025], ['sine', 183.3, .023]],
  'ruined-towers': [['sine', 69.3, .061], ['triangle', 98, .028], ['sine', 138.2, .021]],
  'rift-coast': [['sine', 65.4, .055], ['sine', 98, .035], ['triangle', 164.8, .022]],
};

interface Bed {
  map: CampaignMap;
  gain: GainNode;
  filter: BiquadFilterNode;
  voices: Map<OscillatorNode, GainNode>;
  volume: number;
}

export function mountCampaignAmbience(root: HTMLElement, app: GameApplication,
  environment?: EffectsAudioEnvironment): { sync(): void; destroy(): void } {
  const doc = root.ownerDocument;
  const win = doc.defaultView!;
  const env = environment ?? {
    document: doc, window: win,
    createContext: () => typeof AudioContext === 'undefined' ? null : new AudioContext(),
    visible: () => doc.visibilityState !== 'hidden', focused: () => doc.hasFocus(),
  };
  let focused = env.focused();
  let pageVisible = true;
  let destroyed = false;
  let context: AudioContext | null = null;
  let resuming = false;
  let resumeBlocked = false;
  let active: Bed | null = null;
  const beds = new Set<Bed>();

  function release(bed: Bed): void {
    for (const [voice, mix] of bed.voices) {
      voice.onended = null;
      voice.stop();
      voice.disconnect();
      mix.disconnect();
    }
    bed.voices.clear();
    bed.filter.disconnect();
    bed.gain.disconnect();
    beds.delete(bed);
  }

  function retire(): void {
    if (!active || !context) return;
    const bed = active;
    active = null;
    if (context.state !== 'running') { release(bed); return; }
    const now = context.currentTime;
    bed.gain.gain.cancelScheduledValues(now);
    bed.gain.gain.setTargetAtTime(0, now, .015);
    for (const voice of bed.voices.keys()) voice.stop(now + .09);
  }

  function startBed(audio: AudioContext, map: CampaignMap): Bed {
    const gain = audio.createGain(), filter = audio.createBiquadFilter();
    gain.gain.value = 0;
    filter.type = 'lowpass';
    filter.frequency.value = 235;
    filter.Q.value = .2;
    filter.connect(gain);
    gain.connect(audio.destination);
    const bed: Bed = { map, gain, filter, voices: new Map(), volume: 0 };
    beds.add(bed);
    for (const [wave, frequency, level] of TIMBRES[map]) {
      const voice = audio.createOscillator(), mix = audio.createGain();
      mix.gain.value = level;
      voice.type = wave;
      voice.frequency.value = frequency;
      voice.connect(mix);
      mix.connect(filter);
      bed.voices.set(voice, mix);
      voice.onended = () => {
        voice.disconnect();
        mix.disconnect();
        bed.voices.delete(voice);
        if (!bed.voices.size) release(bed);
      };
      voice.start();
    }
    return bed;
  }

  function resume(): void {
    if (!context || context.state === 'running' || context.state === 'closed' || resuming || resumeBlocked) return;
    resuming = true;
    void context.resume().then(() => {
      resuming = false;
      sync();
    }, () => {
      resuming = false;
      resumeBlocked = true;
    });
  }

  function sync(): void {
    if (destroyed || !context) return;
    const { config, screen, paused, settings } = app.view;
    const map = config.campaignMapId;
    const allowed = focused && pageVisible && env.visible() && settings.soundEnabled && settings.musicVolume > 0;
    if (!allowed || !map || paused || (screen !== 'preparation' && screen !== 'battle')) { retire(); return; }
    if (context.state !== 'running') { retire(); resume(); return; }
    if (active?.map !== map) {
      retire();
      active = startBed(context, map);
    }
    const volume = settings.musicVolume / 100;
    if (active.volume !== volume) {
      active.volume = volume;
      active.gain.gain.setTargetAtTime(volume, context.currentTime, .18);
    }
  }

  const unlock = (event: Event): void => {
    const { soundEnabled, musicVolume } = app.view.settings;
    if (!event.isTrusted || destroyed || !focused || !pageVisible || !env.visible() || !soundEnabled || !musicVolume) return;
    if (!context) {
      try { context = env.createContext(); } catch { return; }
    }
    resumeBlocked = false;
    resume();
    sync();
  };
  const blur = (): void => { focused = false; sync(); };
  const focus = (): void => { focused = true; sync(); };
  const hide = (): void => { pageVisible = false; sync(); };
  const visibility = (): void => { if (env.visible()) focused = env.focused(); sync(); };
  const show = (): void => { pageVisible = true; visibility(); };
  const listeners: readonly [EventTarget, string, EventListener][] = [
    [env.document, 'pointerup', unlock], [env.document, 'keydown', unlock], [env.document, 'click', unlock],
    [env.window, 'blur', blur], [env.window, 'focus', focus],
    [env.window, 'pagehide', hide], [env.window, 'pageshow', show],
    [env.document, 'visibilitychange', visibility],
  ];
  for (const [target, event, listener] of listeners) target.addEventListener(event, listener);
  return { sync, destroy() {
    if (destroyed) return;
    destroyed = true;
    for (const [target, event, listener] of listeners) target.removeEventListener(event, listener);
    for (const bed of beds) release(bed);
    active = null;
    if (context && context.state !== 'closed') void context.close().catch(() => {});
    context = null;
  } };
}
