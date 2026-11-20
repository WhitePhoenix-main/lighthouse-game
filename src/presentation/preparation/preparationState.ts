import type { ChronicleSelection } from './chronicleState';
import type { DeviceKind } from '../../contracts';

export type PreparationPanel = 'devices' | 'lens' | 'ability' | 'recon' | 'night' | 'shards' | 'pearls' | null;

/** Display state only; inventory, purchases and placements belong to the application. */
export interface PreparationUiState {
  panel: PreparationPanel;
  chronicle: ChronicleSelection | null;
  replayIntroChapter?: number;
  catalogKind?: DeviceKind;
  cameraMode: 'overview' | 'close';
  selectedDeviceId: number | null;
  /** Exact owned body being installed or moved; null selects the first ready body of a type. */
  placementDeviceId: number | null;
}

export function createPreparationUiState(): PreparationUiState {
  return { panel: null, chronicle: null, cameraMode: 'overview', selectedDeviceId: null, placementDeviceId: null };
}
