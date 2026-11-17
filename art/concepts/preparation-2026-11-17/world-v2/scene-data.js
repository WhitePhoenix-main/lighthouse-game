// Generated from actual base NIGHT_CATALOG configuration; no profile changes.
globalThis.PREPARATION_SCENE = {
  "version": 5,
  "source": {
    "nightId": "broken-shore",
    "chapter": "Туманный берег",
    "nightName": "Разбитый берег",
    "rulesVersion": "prototype-22-late-modes",
    "profileUpgrades": [],
    "note": "Actual base night configuration; example placements and presentation scales only."
  },
  "projectionY": 0.7,
  "rules": {
    "worldRadius": 400,
    "spawnRadius": 365,
    "lighthouseRadius": 30,
    "beamRange": 300,
    "beamHalfAngle": 0.20943951023931953,
    "placementRadius": 300,
    "shieldRadius": 155
  },
  "assets": {
    "terrain": "./world-v2/terrain-coast-irregular-v1.png",
    "lighthouse": "./world-v2/lighthouse-main.png",
    "props": "./world-v2/props-atlas.png"
  },
  "terrain": {
    "minX": -1500,
    "maxX": 1500,
    "minY": -1428.5714285714287,
    "maxY": 1428.5714285714287
  },
  "sprites": {
    "lighthouse": {
      "asset": "lighthouse",
      "frame": {
        "x": 257,
        "y": 84,
        "width": 502,
        "height": 1337
      },
      "width": 71.33881824981302,
      "height": 190,
      "anchorX": 0.5,
      "anchorY": 0.91
    },
    "cannon": {
      "asset": "props",
      "frame": {
        "x": 113,
        "y": 212,
        "width": 401,
        "height": 268
      },
      "width": 74,
      "height": 49.45635910224439,
      "anchorX": 0.65,
      "anchorY": 0.97
    },
    "barrier": {
      "asset": "props",
      "frame": {
        "x": 798,
        "y": 182,
        "width": 287,
        "height": 284
      },
      "width": 60,
      "height": 59.37282229965157,
      "anchorX": 0.5,
      "anchorY": 0.84
    },
    "pier": {
      "asset": "props",
      "frame": {
        "x": 16,
        "y": 851,
        "width": 600,
        "height": 246
      },
      "width": 145,
      "height": 59.45,
      "anchorX": 0.24,
      "anchorY": 0.6
    }
  },
  "objects": [
    {
      "id": "lighthouse",
      "kind": "lighthouse",
      "name": "Маяк",
      "x": 0,
      "y": 0,
      "radius": 30
    },
    {
      "id": "upper",
      "kind": "cannon",
      "x": -140,
      "y": -140,
      "name": "Пушка",
      "radius": 16,
      "range": 160,
      "health": 70,
      "maxHealth": 70
    },
    {
      "id": "lower",
      "kind": "cannon",
      "x": -140,
      "y": 140,
      "name": "Пушка",
      "radius": 16,
      "range": 160,
      "health": 42,
      "maxHealth": 70
    },
    {
      "id": "barrier",
      "kind": "barrier",
      "x": -230,
      "y": 0,
      "name": "Наземный барьер",
      "radius": 26,
      "range": 0,
      "health": 140,
      "maxHealth": 140
    },
    {
      "id": "pier",
      "kind": "pier",
      "name": "Причал",
      "x": 0,
      "y": 110,
      "radius": 0
    }
  ],
  "deviceDefinitions": {
    "repair-lamp": {
      "name": "Ремонтный фонарь",
      "radius": 16,
      "range": 140,
      "health": 60
    },
    "bell": {
      "name": "Колокол сдерживания",
      "radius": 16,
      "range": 140,
      "health": 70
    },
    "cannon": {
      "name": "Пушка",
      "radius": 16,
      "range": 160,
      "health": 70
    },
    "harpoon": {
      "name": "Гарпунная башня",
      "radius": 14,
      "range": 200,
      "health": 60
    },
    "mortar": {
      "name": "Мортира",
      "radius": 18,
      "range": 230,
      "health": 80
    },
    "barrier": {
      "name": "Наземный барьер",
      "radius": 26,
      "range": 0,
      "health": 140
    },
    "generator": {
      "name": "Генератор",
      "radius": 18,
      "range": 0,
      "health": 60
    },
    "light-trap": {
      "name": "Световая ловушка",
      "radius": 14,
      "range": 0,
      "health": 30
    }
  },
  "visualCoastline": {
    "style": "irregular stepped rock ledges with small headlands and inlets, based on the user reference",
    "gameplayGeometryStatus": "The actual game still uses a straight shoreX boundary; this image is an art study, not a placement mask."
  },
  "currentGameLandBoundary": {
    "shoreX": 0,
    "landOnlyPlacement": true
  }
};
