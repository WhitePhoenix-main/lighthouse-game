import { describe, expect, it, vi } from 'vitest';
import type { ApplicationView, GameApplication } from '../src/contracts';
import { mountCampaignAmbience } from '../src/presentation/battle/campaignAmbience';

class Events extends EventTarget {
  emit(type: string, trusted = true): void {
    const event = new Event(type);
    Object.defineProperty(event, 'isTrusted', { value: trusted });
    this.dispatchEvent(event);
  }
}

function setup() {
  const win = new Events(), doc = new Events();
  const root = { ownerDocument: { defaultView: win } } as unknown as HTMLElement;
  const view = {
    config: { campaignMapId: 'headland' }, screen: 'preparation', paused: false,
    settings: { soundEnabled: true, musicVolume: 42, effectsVolume: 0 },
  } satisfies Pick<ApplicationView, 'screen' | 'paused'> & {
    config: Pick<ApplicationView['config'], 'campaignMapId'>;
    settings: Pick<ApplicationView['settings'], 'soundEnabled' | 'musicVolume' | 'effectsVolume'>;
  };
  const app = { view } as unknown as GameApplication;
  const makeNode = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  const makeGain = () => ({ ...makeNode(), gain: { value: 0, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() } });
  const makeVoice = () => ({
    ...makeNode(), type: '', frequency: { value: 0 }, start: vi.fn(), stop: vi.fn(),
    onended: null as (() => void) | null,
  });
  const gains: ReturnType<typeof makeGain>[] = [], voices: ReturnType<typeof makeVoice>[] = [];
  let finishResume: () => void = () => {};
  const audio = {
    state: 'suspended', currentTime: 4, destination: {},
    createGain() { const gain = makeGain(); gains.push(gain); return gain; },
    createBiquadFilter() { return { ...makeNode(), type: '', Q: { value: 0 }, frequency: { value: 0 } }; },
    createOscillator() { const voice = makeVoice(); voices.push(voice); return voice; },
    resume: vi.fn(() => new Promise<void>(resolve => {
      finishResume = () => { audio.state = 'running'; resolve(); };
    })),
    close: vi.fn(async () => { audio.state = 'closed'; }),
  };
  let shown = true;
  const createContext = vi.fn(() => audio as unknown as AudioContext);
  const player = mountCampaignAmbience(root, app, {
    document: doc, window: win, createContext, visible: () => shown, focused: () => true,
  });
  return {
    view: app.view, win, doc, audio, gains, voices, player, createContext,
    async resume() { finishResume(); await Promise.resolve(); },
    visible(value: boolean) { shown = value; doc.emit('visibilitychange'); },
  };
}

describe('campaign ambience', () => {
  it('unlocks on trusted input, follows music gain and crossfades when the map changes', async () => {
    const s = setup();
    s.player.sync();
    s.doc.emit('click', false);
    expect(s.createContext).not.toHaveBeenCalled();
    s.doc.emit('pointerup');
    await s.resume();
    expect(s.voices.map(voice => voice.frequency.value)).toEqual([73.4, 110, 111.2]);
    expect(s.gains[0]!.gain.setTargetAtTime).toHaveBeenLastCalledWith(.42, 4, .18);
    s.view.settings = { ...s.view.settings, effectsVolume: 80 };
    s.player.sync();
    expect(s.gains[0]!.gain.setTargetAtTime).toHaveBeenCalledTimes(1);
    s.view.config = { ...s.view.config, campaignMapId: 'marsh-islands' };
    s.player.sync();
    expect(s.gains[0]!.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 4, .015);
    expect(s.voices[0]!.stop).toHaveBeenCalledWith(4.09);
    expect(s.voices.slice(3).map(voice => voice.frequency.value)).toEqual([55, 58.3, 82.4]);
    for (const voice of s.voices.slice(0, 3)) voice.onended?.();
    expect(s.gains[0]!.disconnect).toHaveBeenCalled();
    s.player.destroy();
    expect(s.audio.close).toHaveBeenCalledOnce();
    expect(s.voices.every(voice => voice.disconnect.mock.calls.length === 1)).toBe(true);
  });

  it('retires voices on pause, blur, hidden page and mute, including a pending resume', async () => {
    const s = setup();
    s.doc.emit('keydown');
    s.win.emit('blur');
    await s.resume();
    expect(s.voices).toHaveLength(0);
    s.win.emit('focus');
    s.view.screen = 'battle';
    s.view.paused = true;
    s.player.sync();
    expect(s.voices[0]!.stop).toHaveBeenCalled();
    s.view.paused = false;
    s.player.sync();
    s.visible(false);
    expect(s.voices[3]!.stop).toHaveBeenCalled();
    s.visible(true);
    s.win.emit('blur');
    expect(s.voices[6]!.stop).toHaveBeenCalled();
    s.win.emit('focus');
    s.view.settings = { ...s.view.settings, soundEnabled: false };
    s.player.sync();
    expect(s.voices[9]!.stop).toHaveBeenCalled();
    s.player.destroy();
    s.win.emit('focus');
    s.doc.emit('keydown');
    expect(s.createContext).toHaveBeenCalledOnce();
    expect(s.voices).toHaveLength(12);
  });
});
