"""Builds overworld art: terrain, settlements and monster sprites from the HAS pack.
Usage: python3 -I tools/build_world_assets.py <HAS root folder> <output assets folder>"""
import sys, os, json
from PIL import Image
SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(os.path.join(OUT, 'world'), exist_ok=True)
J = lambda *p: os.path.join(SRC, *p)
OW = J('A Terrain & World Maps/HAS Overworld 2.1')
TM = J('A Terrain & World Maps/HAS Overworld 2.1/Additional Materials/HAS Overworld 1.1.2')
BIOMES = ['plains', 'forest', 'swamp', 'wasteland', 'tundra', 'mountain']
SRCB = {'plains': 'GrassBiome/GB', 'forest': 'GrassBiome/GB', 'swamp': 'MarshBiome/MB', 'wasteland': 'SandBiome/SB', 'tundra': 'IceBiome/IB', 'mountain': 'DirtBiome/DB'}
TREE_ROWS = {'plains': (0, 0), 'forest': (0, 96), 'swamp': (0, 48), 'wasteland': (0, 24), 'tundra': (0, 96), 'mountain': (96, 120)}
MOUNT = {'plains': ('GrassBiome/GB', (48, 192)), 'forest': ('GrassBiome/GB', (48, 192)), 'swamp': ('MarshBiome/MB', None), 'wasteland': ('DirtBiome/DB', None), 'tundra': ('IceBiome/IB', None), 'mountain': ('DirtBiome/DB', None)}
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from islands import islands
T = Image.new('RGBA', (16 * 3 * 6 + 16, 72), (0, 0, 0, 0))
for i, b in enumerate(BIOMES):
    folder, pre = SRCB[b].split('/')
    land = Image.open(os.path.join(OW, folder, pre + '-LandTileset.png')).convert('RGBA')
    for k, (x, y) in enumerate([(16, 0), (0, 240), (16, 240)]): T.paste(land.crop((x, y, x + 16, y + 16)), (i * 48 + k * 16, 0))
    trees = Image.open(os.path.join(TM, folder, pre + '-Trees-and-Mountains.png')).convert('RGBA')
    for k, ty in enumerate(TREE_ROWS[b]): T.paste(trees.crop((80, ty, 104, ty + 24)), (i * 48 + k * 24, 16))
    mf, mpos = MOUNT[b]; msheet = os.path.join(TM, mf.split('/')[0], mf.split('/')[1] + '-Trees-and-Mountains.png')
    if mpos is None:
        cands = [c for c in islands(msheet) if c[3] - c[1] >= 28 and (28 <= c[2] - c[0] <= 36 or c[2] - c[0] >= 60)]
        c = max(cands, key=lambda c: (c[1], -c[0])); mpos = (c[0] + (32 if c[2] - c[0] >= 60 else 0), c[1])
    m = Image.open(msheet).convert('RGBA').crop((mpos[0], mpos[1], mpos[0] + 32, mpos[1] + 32)); T.paste(m, (i * 32, 40))
land = Image.open(os.path.join(OW, 'GrassBiome', 'GB-LandTileset.png')).convert('RGBA')
T.paste(land.crop((0, 128, 16, 144)), (288, 0))
T.save(os.path.join(OUT, 'world', 'terrain.png'))

# Settlements: (name, file, crop or None)
BP = 'C Buildings & Towns/HAS Buildings Pack 1.01/HAS Buildings Pack'
UP = 'C Buildings & Towns/HAS Buildings Pack (Unreleased Pack)'
FC = 'B Factions - Creatures & Heroes'
DOCK = 'H Patron Request Add-ons (WR)/WR1 03.21 - CPeasantsDragHoardWallsDocksTowns/DockAndLighthouseSpriteSheet.png'
SPRITES = [
 ('cap_aldmark', f'{BP}/Towns/Castle.png', None), ('cap_sylvan', f'{BP}/Towns/Rampart.png', None), ('cap_undying', f'{BP}/Towns/Necropolis.png', None),
 ('cap_ashborn', f'{BP}/Towns/Inferno.png', None), ('cap_kharn', f'{BP}/Towns/Stronghold.png', None), ('cap_azure', f'{BP}/Towns/Tower.png', None),
 ('cap_dwarf', f'{FC}/HAS Dwarves (v.1.1)/Buildings/DwarvesCastlesSpriteSheet.png', (0, 0, 64, 64)),
 ('cap_woodelf', f'{FC}/HASWoodElves(v.1.0)/Buildings/BuildingSpriteSheet.png', (0, 0, 64, 64)),
 ('cap_orc', f'{FC}/HAS Orcs Empire (1.0)/OrcBuildings.png', (0, 0, 64, 96)),
 ('cap_lizard', f'{FC}/HAS Lizardmen Empire (v.1.1)/LizardmenBuildings.png', (0, 0, 64, 96)),
 ('town_aldmark', f'{UP}/Towns/SmallCastle.png', None), ('town_sylvan', f'{UP}/Towns/SmallRampart.png', None), ('town_undying', f'{UP}/Towns/DragonCastle.png', None),
 ('town_ashborn', f'{UP}/Towns/ForgeCastle.png', None), ('town_kharn', f'{BP}/Treasures/Keep.png', None), ('town_azure', f'{UP}/Towns/OldTower.png', None),
 ('town_dwarf', f'{BP}/Treasures/DwarfFortress.png', None), ('town_woodelf', f'{UP}/Towns/SmallRampart.png', None),
 ('town_orc', f'{FC}/HAS Orcs Empire (1.0)/OrcBuildings.png', (96, 32, 128, 64)), ('town_lizard', f'{UP}/Towns/SwampFortress.png', None),
 ('vil_mill', f'{UP}/Miscellaneous/OldWindMill.png', None), ('vil_water', f'{UP}/Miscellaneous/OldWaterMill.png', None), ('vil_saw', f'{UP}/Miscellaneous/OldSawmill.png', None),
 ('vil_trade', f'{UP}/Miscellaneous/OldTradingPost.png', None), ('vil_seer', f'{UP}/Miscellaneous/OldSeerHut.png', None),
 ('vil_dwarf', f'{FC}/HAS Dwarves (v.1.1)/Buildings/DwarvesDwellingsSpriteSheet.png', (96, 0, 128, 32)),
 ('vil_woodelf', f'{FC}/HASWoodElves(v.1.0)/Buildings/BuildingSpriteSheet.png', (128, 64, 160, 96)),
 ('vil_orc', f'{FC}/HAS Orcs Empire (1.0)/OrcBuildings.png', (64, 0, 96, 32)), ('vil_orc2', f'{FC}/HAS Orcs Empire (1.0)/OrcBuildings.png', (64, 32, 96, 64)),
 ('vil_lizard', f'{FC}/HAS Lizardmen Empire (v.1.1)/LizardmenBuildings.png', (64, 0, 96, 32)), ('vil_lizard2', f'{FC}/HAS Lizardmen Empire (v.1.1)/LizardmenBuildings.png', (96, 64, 128, 96)),
 ('ruins', f'{BP}/Treasures/Ruins.png', None), ('graveyard', f'{BP}/Treasures/Graveyard.png', None),
 ('dock0', f'{DOCK}', (0, 32, 32, 64)), ('dock1', f'{DOCK}', (32, 32, 64, 64)), ('dock2', f'{DOCK}', (64, 32, 96, 64)), ('dock3', f'{DOCK}', (96, 32, 128, 64)),
 ('lighthouse', f'{DOCK}', (48, 0, 64, 32)), ('cave', f'{BP}/Treasures/DaemonCave.png', None),
]
imgs = []
for name, f, crop in SPRITES:
    im = Image.open(J(f)).convert('RGBA')
    if crop: im = im.crop(crop)
    imgs.append((name, im))
W = sum(i.width for _, i in imgs); H = max(i.height for _, i in imgs)
S = Image.new('RGBA', (W, H), (0, 0, 0, 0)); meta = {}; x = 0
for name, im in imgs: S.paste(im, (x, 0)); meta[name] = [x, 0, im.width, im.height]; x += im.width
S.save(os.path.join(OUT, 'world', 'buildings.png'))

# Monsters: 4 idle frames each in 24x24 cells, row order = keys
WILD = J(f'{FC}/HASWildlife (v.1.0)/Animals/AnimalsSheet.png')
WR2 = J('H Patron Request Add-ons (WR)/WR 2.02.21 - BossLizardHerosFirstAidPeasant/BossesSpriteSheet.png')
WR5 = J('H Patron Request Add-ons (WR)/WR5 02.21 - BossHeroShipWall/Bosses/BossesSpriteSheetDnD.png')
ELEM = J('H Patron Request Add-ons (WR)/WR 1.01.21 - ElementalsSpellsWinter/MagicElementals.png')
MON = [
 ('wolves', WILD, 0, 16, 16, 16), ('boars', WILD, 0, 32, 16, 16), ('serpents', WILD, 0, 96, 16, 16),
 ('bloodbloom', WR2, 24, 0, 24, 24), ('panther', WR5, 0, 120, 24, 24), ('hag', WR5, 0, 48, 24, 24), ('hydra', WR2, 24, 48, 24, 24),
 ('lurker', WR2, 24, 24, 24, 24), ('basilisk', WR5, 0, 24, 24, 24), ('pale', WR5, 0, 96, 24, 24), ('eye', WR5, 0, 72, 24, 24),
 ('fire', ELEM, 16, 64, 16, 16), ('ice', ELEM, 16, 16, 16, 16), ('earth', ELEM, 16, 32, 16, 16), ('storm', ELEM, 16, 112, 16, 16),
 ('water', ELEM, 16, 96, 16, 16), ('void', ELEM, 16, 128, 16, 16), ('dragon', WR5, 0, 0, 24, 24),
]
M = Image.new('RGBA', (24 * 4, 24 * len(MON)), (0, 0, 0, 0))
for r, (key, f, x0, y0, cw, ch) in enumerate(MON):
    src = Image.open(f).convert('RGBA')
    for k in range(4):
        cell = src.crop((x0 + k * cw, y0, x0 + (k + 1) * cw, y0 + ch))
        M.paste(cell, (k * 24 + (24 - cw) // 2, r * 24 + (24 - ch)))
M.save(os.path.join(OUT, 'world', 'monsters.png'))
open(os.path.join(OUT, 'world', 'world.js'), 'w').write('// Generated by tools/build_world_assets.py\nexport const BUILDINGS = ' + json.dumps(meta) + ';\nexport const MONSTER_ROWS = ' + json.dumps([m[0] for m in MON]) + ';\nexport const BIOMES = ' + json.dumps(BIOMES) + ';\n')
# Ships: 8 headings x 2 bob frames, the sailing ship only (rows 0 and 3 of the sheet)
SH = Image.open(J('H Patron Request Add-ons (WR)/WR5 02.21 - BossHeroShipWall/Ship/Ship.png')).convert('RGBA')
SP = Image.new('RGBA', (128, 32), (0, 0, 0, 0)); SP.paste(SH.crop((0, 0, 128, 16)), (0, 0)); SP.paste(SH.crop((0, 48, 128, 64)), (0, 16))
SP.save(os.path.join(OUT, 'world', 'ship.png'))
# Portraits: one row per culture, 10 men then 10 women, 16x16 (HAS hero icon sheets)
HZ = 'E All-in-One Compilation/HAS2020 (alpha 1)/Heroes/'
PSRC = {
  'aldmark': (HZ + 'Humans (Castle)/CastleHeroesIconSheet.png', 'sheet'), 'sylvan': (HZ + 'WoodElves (Rampart)/RampartHeroesIconSheet.png', 'sheet'),
  'undying': (HZ + 'HeroIconSheet.png', 256), 'ashborn': (HZ + 'Demons (Inferno)/InfernoHeroesIconSheet.png', 'sheet'),
  'kharn': (HZ + 'Barbarians (Stronghold)/StrongholdHeroesIconSheet.png', 'sheet'), 'azure': (HZ + 'Sagesy (Tower)/TowerHeroesIconSheet.png', 'sheet'),
  'dwarf': (f'{FC}/HAS Dwarves (v.1.1)/Portraits/Small Portraits/heroPortraitsS.png', 'sheet'), 'woodelf': (f'{FC}/HASWoodElves(v.1.0)/Portraits/Small Portraits/heroPortraitsS.png', 'sheet'),
  'orc': (HZ + 'Barbarians (Stronghold)/StrongholdHeroesIconSheet.png', 'sheet'), 'lizard': (HZ + 'Lizardmens (Enclave)/EnclaveHeroesIconSheet.png', 'sheet'),
}
CULT = ['aldmark', 'sylvan', 'undying', 'ashborn', 'kharn', 'azure', 'dwarf', 'woodelf', 'orc', 'lizard']
PO = Image.new('RGBA', (16 * 20, 16 * len(CULT)), (0, 0, 0, 0))
for r, c in enumerate(CULT):
    src = Image.open(J(PSRC[c][0])).convert('RGBA')
    for sex in (0, 1):
        y0 = (PSRC[c][1] if isinstance(PSRC[c][1], int) else 0) + sex * 16
        for k in range(10):
            PO.paste(src.crop((k * 16, y0, k * 16 + 16, y0 + 16)), ((sex * 10 + k) * 16, r * 16))
PO.save(os.path.join(OUT, 'world', 'portraits.png'))
with open(os.path.join(OUT, 'world', 'world.js'), 'a') as fjs: fjs.write('export const PORTRAIT_ROWS = ' + json.dumps(CULT) + ';\n')
print('ok', len(meta), 'buildings', len(MON), 'monsters')
