"""Builds unit atlases (16x16 frames: Idle, Walk, Attack, Hit, Death x4) from the HAS pack.
Usage: python3 -I tools/build_assets.py <HAS root folder> <output assets folder>"""
import sys, os, json
from PIL import Image
SRC = sys.argv[1]; OUT = sys.argv[2]
FC = os.path.join(SRC, 'B Factions - Creatures & Heroes')
CP = os.path.join(FC, 'HAS CreaturePack (v.1.3)/HAS Creature Pack 1.1')
OW = os.path.join(SRC, 'A Terrain & World Maps/HAS Overworld 2.1')
os.makedirs(os.path.join(OUT, 'units'), exist_ok=True); os.makedirs(os.path.join(OUT, 'ground'), exist_ok=True)
ANIMS = ['Idle', 'Walk', 'Attack', 'Hit', 'Death']

# name, role, upgrade target index (None = top of its line)
CLASSIC = {
 'aldmark': ('Castle', [('Pikeman','inf',2),('Archer','ranged',4),('Swordsman','inf',6),('Griffin','flyer',None),('Monk','magic',None),('Cavalier','cav',6),('Paladin','heavy',None)]),
 'ashborn': ('Inferno', [('Imp','inf',3),('Gog','ranged',None),('HellHound','cav',None),('Demon','inf',4),('PitFiend','heavy',6),('Efreet','flyer',None),('Devil','heavy',None)]),
 'undying': ('Necromancer', [('Skeleton','inf',1),('Zombie','heavy',None),('Ghost','flyer',4),('Spider','cav',6),('Vampire','flyer',None),('Lich','magic',None),('Black knight','cav',None)]),
 'sylvan': ('Rampart', [('Pixie','flyer',None),('Dwarf','heavy',None),('Hunter','ranged',5),('Satyr','inf',6),('Deer','cav',None),('Druid','magic',None),('Treant','heavy',None)]),
 'kharn': ('Stronghold', [('Goblin','inf',5),('WolfRider','cav',None),('Harpy','flyer',None),('Shaman','magic',None),('Centaur','ranged',6),('Troll','heavy',None),('Cyclops','ranged',None)]),
 'azure': ('Tower', [('Gremlin','inf',4),('Gargoyle','flyer',5),('Golem','heavy',None),('Mage','magic',6),('Naga','inf',None),('Djinn','flyer',None),('Titan','ranged',None)]),
}
PRETTY = {'Black knight': 'Black Knight', 'HellHound': 'Hell Hound', 'PitFiend': 'Pit Fiend', 'WolfRider': 'Wolf Rider'}
# Sheet factions: (file, frame x origin, [(name, role, row y, upgrade name or None)], shadow row offset or None)
SHEETS = {
 'orc': ('HAS Orcs Empire (1.0)/OrcSpriteSheet.png', 32, 128, [
   ('Grunt','inf',16,'Berserker'),('Raider','inf',32,None),('Boar Rider','cav',48,None),('Spearman','inf',64,None),
   ('Archer','ranged',80,None),('Berserker','heavy',96,None),('Shaman','magic',112,None)]),
 'dwarf': ('HAS Dwarves (v.1.1)/Creatures/DwarvesSpriteSheet.png', 32, None, [
   ('Miner','inf',16,'Veteran Miner'),('Veteran Miner','inf',32,None),('War Bear','cav',48,'Elder War Bear'),('Elder War Bear','cav',64,None),
   ('Crossbowman','ranged',80,'Arbalest'),('Arbalest','ranged',96,None),('Runepriest','magic',112,'Runelord'),('Runelord','magic',128,None),
   ('Ram Rider','cav',144,'Ram Knight'),('Ram Knight','cav',160,None),('Hammerer','heavy',176,'Ironbreaker'),('Ironbreaker','heavy',192,None),
   ('Stone Golem','heavy',208,'Iron Golem'),('Iron Golem','heavy',224,None)]),
 'lizard': ('HAS Lizardmen Empire (v.1.1)/LizardmenSpriteSheet.png', 32, None, [
   ('Skink','inf',16,'Skink Elder'),('Croc Warrior','heavy',32,'Croc Champion'),('Croc Beast','cav',48,'Croc Behemoth'),('Serpent','inf',64,'Golden Serpent'),
   ('Shaman','magic',80,'High Shaman'),('Raptor','cav',96,'Fire Raptor'),('Basilisk','heavy',112,'Elder Basilisk'),
   ('Skink Elder','inf',144,None),('Croc Champion','heavy',160,None),('Croc Behemoth','cav',176,None),('Golden Serpent','inf',192,None),
   ('High Shaman','magic',208,None),('Fire Raptor','cav',224,None),('Elder Basilisk','heavy',240,None)]),
 'woodelf': ('HASWoodElves(v.1.0)/Units/unitsSpriteSheet.png', 0, None, [
   ('Ranger','ranged',192,'Warden'),('Warden','ranged',208,None),('Dryad','magic',0,'Autumn Dryad'),('Autumn Dryad','magic',16,None),
   ('Druid','magic',64,'Archdruid'),('Archdruid','magic',80,None),('Centaur','ranged',96,'Centaur Elder'),('Centaur Elder','ranged',112,None),
   ('Bear','heavy',128,'Grey Bear'),('Grey Bear','heavy',144,None),('Treant','heavy',32,'Autumn Treant'),('Autumn Treant','heavy',48,None)]),
}
defs = {}
for fid, (folder, units) in CLASSIC.items():
    sheet = Image.new('RGBA', (16 * 20, 16 * len(units)), (0, 0, 0, 0)); out = []
    for r, (u, role, up) in enumerate(units):
        d = os.path.join(CP, folder, u); files = os.listdir(d)
        pre = [f for f in files if 'Idle' in f][0].split('Idle')[0]
        for a, anim in enumerate(ANIMS):
            for fr in range(4):
                cand = [f for f in files if f.startswith(pre + anim) and f'Frame {fr + 1})' in f] or [f for f in files if f.startswith(pre + anim)]
                if cand: sheet.paste(Image.open(os.path.join(d, cand[0])).convert('RGBA').crop((0, 0, 16, 16)), ((a * 4 + fr) * 16, r * 16))
        out.append({'name': PRETTY.get(u, u), 'role': role, 'up': up})
    sheet.save(os.path.join(OUT, 'units', fid + '.png')); defs[fid] = out
for fid, (path, x0, shadowY, units) in SHEETS.items():
    src = Image.open(os.path.join(FC, path)).convert('RGBA')
    sheet = Image.new('RGBA', (16 * 20, 16 * len(units)), (0, 0, 0, 0)); out = []
    names = [u[0] for u in units]
    for r, (name, role, y, up) in enumerate(units):
        for c in range(20):
            cell = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
            if shadowY is not None:  # orcs keep their shadows on a separate layer below the units
                cell.alpha_composite(src.crop((x0 + c * 16, y + shadowY, x0 + c * 16 + 16, y + shadowY + 16)))
            cell.alpha_composite(src.crop((x0 + c * 16, y, x0 + c * 16 + 16, y + 16)))
            sheet.paste(cell, (c * 16, r * 16))
        out.append({'name': name, 'role': role, 'up': names.index(up) if up else None})
    sheet.save(os.path.join(OUT, 'units', fid + '.png')); defs[fid] = out
# entry units: the ones nothing upgrades into
for f, us in defs.items():
    targets = {u['up'] for u in us if u['up'] is not None}
    for i, u in enumerate(us): u['entry'] = i not in targets
json.dump(defs, open(os.path.join(OUT, 'units', 'units.json'), 'w'), indent=1)
open(os.path.join(OUT, 'units', 'units.js'), 'w').write('// Generated by tools/build_assets.py\nexport const UNITS = ' + json.dumps(defs) + ';\n')
# ammunition
am = Image.new('RGBA', (32, 8), (0, 0, 0, 0))
for i, n in enumerate(['arrow', 'bolt', 'fireball', 'rock']): am.paste(Image.open(os.path.join(CP, 'Ammunition', n + '.png')).convert('RGBA').crop((0, 0, 8, 8)), (i * 8, 0))
am.save(os.path.join(OUT, 'ammo.png'))
# ground per biome: 3 base tiles + 5 decorations, then 6 decorations, a tree and a rock/alt tree
BI = {'plains': 'GrassBiome/GB', 'forest': 'GrassBiome/GB', 'swamp': 'MarshBiome/MB', 'wasteland': 'SandBiome/SB', 'tundra': 'IceBiome/IB', 'mountain': 'DirtBiome/DB'}
for b, p in BI.items():
    folder, pre = p.split('/')
    land = Image.open(os.path.join(OW, folder, pre + '-LandTileset.png')).convert('RGBA')
    trees = Image.open(os.path.join(OW, 'Additional Materials/HAS Overworld 1.1.2', folder, pre + '-Trees-and-Mountains.png')).convert('RGBA')
    g = Image.new('RGBA', (16 * 8, 16 * 2), (0, 0, 0, 0))
    g.paste(land.crop((16, 0, 32, 16)), (0, 0)); g.paste(land.crop((0, 240, 16, 256)), (16, 0)); g.paste(land.crop((16, 240, 32, 256)), (32, 0))
    for i in range(5): g.paste(land.crop((32 + i * 16, 0, 48 + i * 16, 16)), (48 + i * 16, 0))
    for i in range(6): g.paste(land.crop((112 + i * 16, 0, 128 + i * 16, 16)), (i * 16, 16))
    g.paste(trees.crop((16, 48, 32, 64)), (96, 16)); g.paste(trees.crop((16, 192, 32, 208)), (112, 16))
    g.save(os.path.join(OUT, 'ground', b + '.png'))
print({f: len(u) for f, u in defs.items()})
