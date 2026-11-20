import type { NightConfig } from '../contracts';
import { CAMPAIGN_GENERAL_DRAFT, type CampaignGeneralDraftNode, type CampaignGeneralFamily } from '../content/campaignGeneralDraft';

export function campaignGeneralRanks(purchased: ReadonlySet<string>): ReadonlyMap<CampaignGeneralFamily, CampaignGeneralDraftNode> {
  const ranks = new Map<CampaignGeneralFamily, CampaignGeneralDraftNode>();
  for (const node of CAMPAIGN_GENERAL_DRAFT) {
    if (purchased.has(node.id) && node.rank > (ranks.get(node.family)?.rank ?? 0)) ranks.set(node.family, node);
  }
  return ranks;
}

/** Geometry is a permanent beam upgrade, before the selected lens multiplies it. */
export function campaignBeamBase(base: NightConfig, ranks: ReturnType<typeof campaignGeneralRanks>): NightConfig {
  const beam = { ...base.beam };
  for (const { effect } of ranks.values()) {
    if (effect.kind === 'beamGeometry') beam[effect.stat] += effect.amount;
  }
  return { ...base, beam, availableDevices: [] };
}

/** The caller owns this fresh config. Carry the highest purchased effect of each family to simulation. */
export function applyCampaignGeneral(config: NightConfig, ranks: ReturnType<typeof campaignGeneralRanks>): void {
  delete config.campaignGeneral;
  for (const [family, { effect }] of ranks) {
    const owned = structuredClone(effect);
    (config.campaignGeneral ??= {})[family] = owned;
    if (owned.kind === 'quickTurn') config.beam.quickTurn = { ...owned.rules };
    if (owned.kind === 'shieldStabilization') config.shield.stabilization = { ...owned.rules };
  }
}
