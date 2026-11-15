import type { BattleState, CombatEventData } from '../contracts';

const HISTORY_LIMIT = 256;

/** A bounded journal of facts; it consumes neither random values nor combat time. */
export function emitCombatEvent(state: BattleState, data: CombatEventData): void {
  state.events.push({ ...data, id: state.nextEventId++, tick: state.tick });
  if (state.events.length > HISTORY_LIMIT) state.events.splice(0, state.events.length - HISTORY_LIMIT);
}
