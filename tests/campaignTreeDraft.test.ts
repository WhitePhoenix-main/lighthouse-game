import { describe, expect, it } from 'vitest';
import { UPGRADES } from '../src/content/upgrades';
import { LENSES, LENS_UPGRADES } from '../src/content/lenses';
import { CAMPAIGN_GENERAL_DRAFT } from '../src/content/campaignGeneralDraft';
import { CAMPAIGN_ABILITY_DRAFT } from '../src/content/campaignAbilityDraft';
import { CAMPAIGN_TREE_DRAFT, validateCampaignTreeDraft, campaignLensUnlockId } from '../src/content/campaignTreeDraft';

describe('256-node campaign plan without branch compression', () => {
  it('retains every existing purchase and adds exactly 16 general + 40 ability nodes', () => {
    expect(() => validateCampaignTreeDraft()).not.toThrow();
    expect(CAMPAIGN_TREE_DRAFT).toHaveLength(256);
    expect(CAMPAIGN_TREE_DRAFT.filter(node => node.source.startsWith('existing-'))).toHaveLength(200);
    expect(CAMPAIGN_TREE_DRAFT.filter(node => node.source === 'general-draft')).toHaveLength(16);
    expect(CAMPAIGN_TREE_DRAFT.filter(node => node.source === 'ability-draft')).toHaveLength(40);
    for (const node of UPGRADES) {
      expect(CAMPAIGN_TREE_DRAFT.find(entry => entry.id === node.id))
        .toMatchObject({ sourceId: node.id, source: 'existing-upgrade', requires: node.requires });
    }
    const flash = CAMPAIGN_TREE_DRAFT.filter(node => node.category === 'ability' && node.branch === 'flash');
    expect(flash).toHaveLength(16);
    expect(flash.every(node => node.source === 'existing-upgrade')).toBe(true);
  });

  it('retains lens ownership ids separately from upgrade ids and represents implicit unlock requirements', () => {
    for (const lens of LENSES.filter(node => node.id !== 'basic')) {
      expect(CAMPAIGN_TREE_DRAFT.find(node => node.id === campaignLensUnlockId(lens.id)))
        .toMatchObject({ sourceId: lens.id, source: 'existing-lens-unlock', branch: lens.id });
    }
    for (const upgrade of LENS_UPGRADES) {
      const entry = CAMPAIGN_TREE_DRAFT.find(node => node.id === upgrade.id)!;
      expect(entry.sourceId).toBe(upgrade.id);
      expect(entry.requires).toEqual(upgrade.lensId === 'basic' ? upgrade.requires
        : [campaignLensUnlockId(upgrade.lensId), ...upgrade.requires]);
    }
    expect(CAMPAIGN_TREE_DRAFT.some(node => node.id === campaignLensUnlockId('basic'))).toBe(false);
  });

  it('does not alias source dependency arrays or insert draft nodes into the live catalog', () => {
    const before = JSON.stringify({ UPGRADES, LENSES, LENS_UPGRADES, CAMPAIGN_GENERAL_DRAFT, CAMPAIGN_ABILITY_DRAFT });
    const entry = CAMPAIGN_TREE_DRAFT.find(node => node.id === 'flash-damage-1')!;
    expect(entry.requires).not.toBe(UPGRADES.find(node => node.id === entry.id)!.requires);
    validateCampaignTreeDraft();
    expect(JSON.stringify({ UPGRADES, LENSES, LENS_UPGRADES, CAMPAIGN_GENERAL_DRAFT, CAMPAIGN_ABILITY_DRAFT })).toBe(before);
    expect(UPGRADES.length + LENS_UPGRADES.length + LENSES.length - 1).toBe(200);
  });

  it('rejects removal, duplicate ids and changes in branch membership even with the same total', () => {
    expect(() => validateCampaignTreeDraft(CAMPAIGN_TREE_DRAFT.slice(1))).toThrow();
    const duplicate = [...structuredClone(CAMPAIGN_TREE_DRAFT)];
    duplicate[1] = duplicate[0]!;
    expect(() => validateCampaignTreeDraft(duplicate)).toThrow(/duplicate/);
    const swapped = structuredClone(CAMPAIGN_TREE_DRAFT).map(node => ({ ...node,
      branch: node.id === 'flash-damage-1' ? 'overload' : node.id === 'ability-overload-power-1' ? 'flash' : node.branch }));
    expect(() => validateCampaignTreeDraft(swapped)).toThrow();
  });

  it('rejects missing references and cycles spanning existing and planned nodes', () => {
    const unknown = structuredClone(CAMPAIGN_TREE_DRAFT).map(node => node.id === 'beam-disruption-1'
      ? { ...node, requires: ['missing-node'] } : node);
    expect(() => validateCampaignTreeDraft(unknown)).toThrow(/unknown dependency/);
    const cycle = structuredClone(CAMPAIGN_TREE_DRAFT).map(node => node.id === 'beam-power-1'
      ? { ...node, requires: ['beam-disruption-1'] } : node);
    expect(() => validateCampaignTreeDraft(cycle)).toThrow(/cycle/);
  });

  it('rejects lost prerequisites and silent substitution of an original ownership id', () => {
    const removed = structuredClone(CAMPAIGN_TREE_DRAFT).map(node => node.id === 'flash-damage-1'
      ? { ...node, requires: [] } : node);
    expect(() => validateCampaignTreeDraft(removed)).toThrow(/source or dependency/);
    const substituted = structuredClone(CAMPAIGN_TREE_DRAFT).map(node => node.id === campaignLensUnlockId('expanded')
      ? { ...node, sourceId: 'different-lens' } : node);
    expect(() => validateCampaignTreeDraft(substituted)).toThrow(/source or dependency/);
  });
});
