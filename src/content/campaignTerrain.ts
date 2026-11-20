import type { CampaignMapDraftId } from './campaignFoundationDraft';
import { CHAPTER_TERRAIN, type GroundApproach, type Terrain, type TerrainPoint } from './terrain';

type Coordinates = readonly [number, number];
type CampaignTerrain = Terrain & { groundRoutes: NonNullable<Terrain['groundRoutes']> };

function points(coordinates: readonly Coordinates[]): TerrainPoint[] {
  return coordinates.map(([x, y]) => ({ x, y }));
}

function approach([x, y]: Coordinates, ...via: Coordinates[]): GroundApproach {
  return { direction: { x, y }, halfAngle: Math.PI / 30, ...(via.length ? { via: points(via) } : {}) };
}

function coast(shoreX: number, shoreline: readonly Coordinates[], groundRoutes: CampaignTerrain['groundRoutes']): CampaignTerrain {
  return { shoreX, landOnlyPlacement: true, groundSpawn: 'dry-approach', shoreline: points(shoreline), groundRoutes };
}

/** Provisional D–E world coordinates. The ground fronts do not define air or sea spawns. */
export const CAMPAIGN_TERRAIN: Readonly<Record<CampaignMapDraftId, CampaignTerrain>> = {
  headland: {
    ...CHAPTER_TERRAIN, groundSpawn: 'dry-approach',
    groundRoutes: { north: approach([-310, -192]), south: approach([-343, 123]) },
  },
  sandspit: coast(145, [
    [36, -450], [114, -307], [200, -224], [226, -147], [217, -82], [185, -30], [132, 35],
    [63, 97], [-12, 158], [-82, 224], [-161, 284], [-239, 354], [-311, 450],
  ], { north: approach([-305, -200]), south: approach([-362, 47]) }),
  'marsh-islands': {
    shoreX: 0, landOnlyPlacement: true, groundSpawn: 'dry-approach',
    landRegions: [
      // The two raised islands and the central shelf share a boundary around their dry necks.
      points([
        [-354, -232], [-331, -285], [-231, -314], [-160, -299], [-110, -256],
        [-125, -220], [-85, -165], [-29, -135], [48, -128], [115, -94], [134, -25],
        [125, 45], [153, 110], [110, 147], [38, 144], [-38, 143], [-80, 171],
        [-115, 225], [-108, 264], [-171, 301], [-238, 313], [-329, 286], [-354, 230],
        [-313, 180], [-245, 183], [-198, 194], [-163, 148], [-126, 102], [-138, 59],
        [-128, 12], [-157, -39], [-135, -82], [-162, -136], [-197, -189], [-252, -175], [-315, -172],
      ]),
      points([[164, -212], [213, -215], [241, -182], [217, -155], [179, -153], [151, -178]]),
      points([[-89, 315], [-43, 291], [10, 308], [21, 350], [-28, 377], [-75, 365]]),
    ],
    groundRoutes: {
      north: approach([-275, -240], [-165, -230]),
      south: approach([-275, 240], [-176, 239]),
    },
  },
  'ashen-plateau': coast(181, [
    [-52, -420], [3, -340], [78, -258], [142, -174], [174, -110], [181, -40], [181, 40],
    [165, 112], [132, 180], [72, 255], [-4, 336], [-68, 420],
  ], { north: approach([-245, -270]), south: approach([-245, 270]) }),
  'wreck-channel': coast(90, [
    [108, -440], [127, -295], [111, -215], [72, -153], [87, -75], [90, 15], [113, 77],
    [124, 141], [75, 199], [0, 260], [-103, 313], [-165, 405], [-186, 450],
  ], { north: approach([-315, -185]), south: approach([-350, 103]) }),
  'ruined-towers': coast(108, [
    [104, -450], [169, -338], [204, -253], [171, -150], [119, -86], [108, -15], [123, 65],
    [164, 133], [209, 205], [196, 275], [135, 348], [109, 450],
  ], { north: approach([-233, -281]), south: approach([-228, 285]) }),
  'rift-coast': coast(62, [
    [52, -420], [80, -315], [136, -245], [149, -192], [128, -144], [106, -92], [80, -48],
    [62, 0], [82, 55], [111, 102], [139, 152], [168, 207], [152, 263], [105, 338], [63, 420],
  ], { north: approach([-305, -200]), south: approach([-305, 200]) }),
};
