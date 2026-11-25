# The Dynasty

**▶ Play it live: https://dianteclark.github.io/thedynasty/**

A living fantasy world sim. Kingdoms, lordships, free villages, vagabonds, bandits and mercenaries all play by the same rules, and the world writes its own history into the Chronicle.

On your phone, open the live link and choose **Add to Home Screen** to install it like an app.

## Prototype 0.1: the world sim

This first build tests the most important question: does the world tell interesting stories on its own? Generate a world, press play or jump ahead 100 years, then read the Chronicle.

What the world does by itself:

- **Seasons and food:** harvests, droughts, famine, and rulers sending food aid (starving villages may pledge themselves to whoever feeds them)
- **The power ladder:** vagabonds and bandits rise to rule villages, villages unite into lordships and kingdoms, and kingdoms break apart
- **Overextension:** large realms suffer unrest in distant holdings, leading to uprisings with real causes
- **War:** declarations, battles shaped by season, terrain, morale, spies and fear, sieges, mercenaries who can be bought out, defections, peace treaties, and wards sent to rival courts
- **Officers and armies:** officer levels (cap 20), army levels (cap 10), troop tiers (Levies → Regulars → Veterans → Elite), and the rules for who takes over an army when its officer falls
- **Titles:** Rank, Deed and Reputation slots, unique titles (Strongest Under Heaven), and counters (Giant Slayer vs Legendary Army, Deaf Ears vs the Butcher)
- **Intrigue:** spies (who can be caught, hanged, ransomed or turned), smear campaigns, assassins in disguise against guard settings, and framing at tournaments
- **Dynasty:** marriages, duels for a hand, heirs, sworn brotherhood, succession by blood, oath or officer, legitimacy, breakaways and civil war
- **Monsters:** lairs grow, outbreaks ravage or destroy settlements, and heroes slay, trap or tame the beasts
- **Ruins are resettled**, and new blood keeps arriving

Worlds are deterministic: the same seed and size always produce the same world. Your current world is saved on your device.

## Structure

- `index.html`, `css/style.css`: the mobile app shell
- `js/sim.js`: the world simulation
- `js/names.js`: cultures and name generation
- `js/ui.js`: Chronicle, Map, Realms, People and Stats views
- `manifest.webmanifest`, `sw.js`, `icons/`: home-screen app support (works offline)

Art style reference: HAS pixel art by Aleksandr Makarov (credit will be given when sprites are added).

## Prototype 0.2: the battle map

The **Battle** tab sets up a battle on a map built from the HAS overworld tiles:

- Six factions with HAS Creature Pack sprites (idle, walk, attack, hit and death animations)
- Three divisions per side, each led by an officer with Leadership, Might, Intellect and Charisma
- Orders (hold, advance, charge, flank left or right, fall back) ride out by messenger, and higher Leadership gets them there faster
- Morale decides battles: flank and rear attacks, fire, fallen officers and nearby routs all shake troops; broken divisions flee, and officers with high Charisma can rally them
- One stratagem: a volley of fire arrows that hits friend and foe alike
- An enemy general with a reckless, balanced or cautious personality
- Pan, pinch to zoom, overview toggle, minimap, and pause / 1× / 2× / 4× speed

Sprite atlases are built from the original HAS frames by `tools/build_assets.py`.

## Prototype 0.3: world battles

- Every war in the world is fought on the battle engine, using the real officers, army sizes and levels, terrain, season, mercenaries and militia
- Each officer's army has a unit type that suits them (leaders ride, thinkers shoot or cast, fighters hold the line), and at each troop tier it upgrades to the next unit in its line, so you can tell veterans on sight
- All ten cultures fight with HAS sprites, including Dwarves, Lizardmen and Wood Elves (base and upgraded units) and Orcs
- What carries into battle: fear of a Legendary Army (cancelled by a Giant Slayer), the Butcher's reputation (cancelled by Deaf Ears), famine, spy intel, a duel won before the lines, defenders holding mountains, and only officers with Intellect 12+ can call a fire volley
- Generals fight in character: reckless, cautious or balanced, from their traits
- Watch battles as they happen (⚙ → never, big battles, every battle); the world pauses and the battle map opens. Skipped battles use the same engine with each soldier standing in for a company
- Saves stay exact: battles you watched are re-fought step for step when your world is rebuilt

## Prototype 0.4: the overworld

The **Map** tab is now a living world map drawn with HAS art:

- Terrain from the HAS Overworld tiles: grassland, forest, swamp, wasteland, tundra and mountains, with trees and peaks laid out per land type
- Settlements drawn by culture and size: castles for kingdom capitals (Castle, Rampart, Necropolis, Inferno, Stronghold, Tower, Dwarven, Wood Elf, Orc and Lizardmen), towns for lordship seats and big towns, and windmills, watermills, sawmills, huts and graveyards for villages; ruins where a settlement was destroyed
- Realm borders and tints, capital name plates (⚔ when at war), and settlement names when zoomed in
- Monster lairs shown with the monster's own sprite, glowing red when ready to break out
- Armies march: a war host gathers at the nearest friendly holding and marches on its target (slower in winter, swamps, forests and mountains); the battle happens when it arrives. Hosts show their actual troops walking under the realm's banner
- Recent battle sites and famines are marked
- Pan, pinch to zoom, ⤢ for the whole map, a minimap you can tap to jump, and tap any settlement, host or lair for details

Overworld art is built by `tools/build_world_assets.py`.
