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
