import sys, os, json
from PIL import Image
SRC = sys.argv[1]; OUT = sys.argv[2]
CP = os.path.join(SRC, 'B Factions - Creatures & Heroes/HAS CreaturePack (v.1.3)/HAS Creature Pack 1.1')
OW = os.path.join(SRC, 'A Terrain & World Maps/HAS Overworld 2.1')
os.makedirs(os.path.join(OUT, 'units'), exist_ok=True); os.makedirs(os.path.join(OUT, 'ground'), exist_ok=True)
FACTIONS = {
 'aldmark': ('Castle', ['Pikeman','Archer','Swordsman','Griffin','Monk','Cavalier','Paladin']),
 'ashborn': ('Inferno', ['Imp','Gog','HellHound','Demon','PitFiend','Efreet','Devil']),
 'undying': ('Necromancer', ['Skeleton','Zombie','Ghost','Spider','Vampire','Lich','Black knight']),
 'sylvan': ('Rampart', ['Pixie','Dwarf','Hunter','Satyr','Deer','Druid','Treant']),
 'kharn': ('Stronghold', ['Goblin','WolfRider','Harpy','Shaman','Centaur','Troll','Cyclops']),
 'azure': ('Tower', ['Gremlin','Gargoyle','Golem','Mage','Naga','Djinn','Titan']),
}
ANIMS = ['Idle','Walk','Attack','Hit','Death']
meta = {}
for fid,(folder,units) in FACTIONS.items():
    sheet = Image.new('RGBA', (16*20, 16*len(units)), (0,0,0,0))
    names=[]
    for r,u in enumerate(units):
        d = os.path.join(CP, folder, u); files = os.listdir(d)
        pre = [f for f in files if 'Idle' in f][0].split('Idle')[0]
        for a,anim in enumerate(ANIMS):
            for fr in range(4):
                cand = [f for f in files if f.startswith(pre+anim) and f'Frame {fr+1})' in f]
                if not cand: cand = [f for f in files if f.startswith(pre+anim)]
                if not cand: continue
                im = Image.open(os.path.join(d, sorted(cand)[min(fr, len(cand)-1)] if len(cand)>1 else cand[0])).convert('RGBA')
                sheet.paste(im.crop((0,0,16,16)), ((a*4+fr)*16, r*16))
        names.append(u.replace('Black knight','Black Knight').replace('HellHound','Hell Hound').replace('PitFiend','Pit Fiend').replace('WolfRider','Wolf Rider'))
    sheet.save(os.path.join(OUT,'units',fid+'.png')); meta[fid]=names
# ammunition
am = Image.new('RGBA',(32,8),(0,0,0,0))
for i,n in enumerate(['arrow','bolt','fireball','rock']): am.paste(Image.open(os.path.join(CP,'Ammunition',n+'.png')).convert('RGBA').crop((0,0,8,8)),(i*8,0))
am.save(os.path.join(OUT,'ammo.png'))
# ground per biome: 2 base tiles, 8 small decorations, tree, pine, rock
BI = {'plains':'GrassBiome/GB','forest':'GrassBiome/GB','swamp':'MarshBiome/MB','wasteland':'SandBiome/SB','tundra':'IceBiome/IB','mountain':'DirtBiome/DB'}
for b,p in BI.items():
    folder, pre = p.split('/')
    land = Image.open(os.path.join(OW, folder, pre+'-LandTileset.png')).convert('RGBA')
    trees = Image.open(os.path.join(OW, 'Additional Materials/HAS Overworld 1.1.2', folder, pre+'-Trees-and-Mountains.png')).convert('RGBA')
    g = Image.new('RGBA',(16*8,16*2),(0,0,0,0))
    g.paste(land.crop((16,0,32,16)),(0,0)); g.paste(land.crop((0,240,16,256)),(16,0)); g.paste(land.crop((16,240,32,256)),(32,0))
    for i in range(5): g.paste(land.crop((32+i*16,0,48+i*16,16)),(48+i*16,0))
    for i in range(6): g.paste(land.crop((112+i*16,0,128+i*16,16)),(i*16,16))
    g.paste(trees.crop((16,48,32,64)),(96,16)); g.paste(trees.crop((16,192,32,208)),(112,16))
    g.save(os.path.join(OUT,'ground',b+'.png'))
    trees.save(os.path.join(OUT,'ground',b+'-trees.png'))
json.dump(meta, open(os.path.join(OUT,'units','units.json'),'w'), indent=1)
print(meta)
