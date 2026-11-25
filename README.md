# The Dynasty

**▶ Play it: https://dianteclark.github.io/thedynasty/** · v2.8

A living fantasy world sim with no fixed ending. Start as a vagabond, a village headman, a minor lord or an heir, on the first day of a young world or dropped into one that has already lived through 30 to 100 years of history, and try to build something that outlives you. Kingdoms, villages, bandits, mercenaries and monsters all play by the same rules you do, and the world writes everything into its Chronicle.

On your phone, open the link and choose **Add to Home Screen**. It runs full-screen and works offline.

## How to play

1. **Create your character** on the 🛡 Household tab: origin, culture (ten of them), name, and ironman or casual.
2. **Live:** the 🗺 Map is your main screen and the world runs in real time, one month every minute. You can pause (❚❚), but you can't hurry time: you only control yourself.
3. **Act** from the 🏰 Court (or Camp, if you don't rule), the 🛡 Household tab, or by tapping things on the 🗺 Map. Matters that need an answer collect under 📜 at the top: answer them before their deadline or they are settled without you.
4. **Fight** your battles on the battle map: command them, watch your generals, or resolve them quickly.
5. **Name a successor.** When you die, you carry on as them. If no one can, your line ends and the world goes on without you.

## What's in it

- **A living world:** procedurally generated worlds in three sizes with continents, islands and named wilds, ports and sailing, earthquakes, wildfires and floods that reshape the land, seasons, harvests and famine, a ladder of power from vagabond bands to kingdoms, overextension, uprisings with causes, succession crises, monsters that grow and break out, and ruins that get resettled.
- **People:** officers with five stats, levels and up to three titles (rank, deed, reputation) that can counter each other; marriages, children who take after their parents, oaths, grudges, wards, rumors and reputations.
- **War:** hosts march (and sail) across the map; battles are Dynasty Warriors-style fields with bases, garrisons and up to 30,000 troops, fought on a real battle engine with HAS sprites for all ten cultures, morale and routs, flanking, messenger-delayed orders, stratagems, troop tiers you can recognise on sight, and generals who fight in character.
- **Intrigue:** spies, assassins, agitators, envoys, caravans and rumors travel the map and can be caught or raided.
- **Ruling:** your council (steward, spymaster, captain), granaries, levies, armies, diplomacy and peace terms.
- **Honour:** duels and tournaments you can watch, challenges and stances, the unique title Strongest Under Heaven.
- **Saves, seeds and mods:** instant-loading save slots, shareable seeds, and JSON mods.

## Credits

All art is from the **HAS (Heroic Fantasy)** pixel art packs by **Aleksandr Makarov** ([@IknowKingRabbit](https://twitter.com/IknowKingRabbit)), used under the pack's license, which allows commercial and modified use with attribution.

## Development history

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

## Prototype 0.5: you

You live in the world now. The **You** tab is where your story happens.

- **Character creation:** pick an origin (vagabond, village headman, minor lord or heir), one of the ten cultures, a name, and a mode. The world lives through 30 years of history first, then you are placed somewhere fitting within it.
- **One life:** name a successor (a child, sibling, sworn sibling, companion or one of your officers). Kin always accept; anyone else must like you enough (opinion 20+), and must be alive and free. When you die, you continue as them; if no one can carry on, your line ends and you can start a new life in the same world or a new one.
- **Ironman or casual:** casual mode spares you from death once.
- **As a vagabond:** travel (tap any settlement on the map), take contracts against bandits (fought on the battle map with your band) or monster lairs (slay, trap or tame, with your odds shown), hire sellswords, win over companions, offer your sword to a lord, or found a village.
- **As an officer or heir:** drill your troops, swear brotherhood with a fellow officer, leave service, or rebel and seize a holding.
- **As a ruler:** set taxes and the guard, recruit officers, host tournaments, declare war, sue for peace, and win over free villages.
- **Marriage** for everyone: rulers' marriages bind alliances.
- **Your battles:** when your army takes the field you choose to command it, let your generals fight while you watch, or resolve it quickly. You can hand over to your generals mid-battle.
- **Danger with warning:** plots against you can be uncovered by your spymaster (or your own wits and companions) before they strike. Lock down the guard, or keep moving.
- **Time stops for you:** playing or skipping years pauses whenever something happens to you.
- **Saves are exact:** your world is rebuilt from its seed, your actions and your battle orders.

The battle sandbox has moved to the Stats tab.

## 0.6: ruling

- **Your council:** appoint a Steward (Politics: more income, sends grain to your own starving holdings), a Spymaster (Intellect: uncovers plots, runs spies) and a Captain of the Guard (Leadership: catches assassins, and can set the guard for you as threats change). AI realms fill their councils too.
- **Granaries:** see every holding's food; send grain to famine-struck places within reach. Feeding your own calms them; feeding others wins hearts, and free villages may join you.
- **Armies:** raise levies (2 troops per gold, limited by your population each year) and swap armies between officers so your best troops serve your best commander.
- **Your children:** arrange matches with ruling houses (alliances while the couple lives; betrothals for the young), or send a child as a ward for ten years of peace.
- **Peace terms:** offer peace, pay 100 gold, cede a holding, or send a child as a ward.
- AI rulers now spend surplus gold on troops.

## 0.7: agents on the map

Everyone on a mission now travels the map, and can be stopped on the way.

- **Spies** ride from their spymaster's seat to the enemy capital; they succeed, hang, get turned into double agents, or are ransomed when they arrive.
- **Assassins** travel to their target. Plots against you arrive the same way: warnings come first if your spymaster is good, a vagabond who keeps moving can lose them, and a ruler can spot and seize them in their lands.
- **Agitators** linger in a town for months, stoking unrest until they leave or are caught.
- **Envoys** carry peace; a war ends when they arrive.
- **Caravans** carry trade between capitals and allies, paying both. Bandits prey on them, and so can you.
- **Rumors** visibly travel town to town.
- Realms catch hidden agents crossing their lands (spymaster and captain help); for you, spotted agents glow red on the map and in your Intrigue card, ready to seize.
- **Your intrigue (as a ruler):** send spies against enemies (improves your next battle), send agitators to rival towns, smear a rival (unless they are too sharp and earn the name Deaf Ears), or hire an assassin (if they talk, it means war).
- **As a vagabond:** raid passing caravans for gold, at the cost of the owners' hatred and the name "the Brigand".

## 0.8: dynasty depth

- **Watch duels:** every duel and tournament is recorded; tap ▶ Watch in the Chronicle or your story to see it fought bout by bout with HAS sprites, ending exactly as it happened.
- **Challenges:** challenge rivals you hold a grudge against, or the holder of Strongest Under Heaven, choosing a stance (aggressive hits harder but is deadlier for both, defensive is weaker but rarely fatal). Rivals challenge you too; refuse, or let three months pass, and you are called craven.
- **Tournaments** are announced two months ahead; enter any within reach and ride in the lists with blunted blades.
- **Titles:** grant General, Marshal or Champion to your officers (Marshals and Generals lift morale in battle), or strip a rank (they won't forget).
- **Heirs take after their parents:** children inherit traits from their mother and father.
- **Your dynasty:** a family tree on the You tab and your line of succession.

## 0.9: content and polish

- **Instant loading:** saves are now snapshots of the whole world (stored in your browser's IndexedDB), so even a 200-year game opens in a fraction of a second. Older saves are converted once, automatically.
- **Save slots:** up to three worlds, listed under ⚙ with Continue and Delete.
- **Seed sharing:** copy your world's seed from ⚙ and give it to a friend.
- **Mods:** load a JSON mod from ⚙ to rename cultures, change their name pools, and tune wars, monsters, famines, plots and tournaments. See `mods/grim-and-perilous.json` for the format:

```json
{
  "name": "My mod",
  "tune": { "war": 1.5, "monsters": 1.2, "famine": 1, "plots": 1, "tournaments": 1 },
  "cultures": { "aldmark": { "name": "Westmarch", "p1": ["Grey", "Cold"], "p2": ["moor", "hold"], "m": ["Ed", "Os"], "me": ["ric"], "f": ["El"], "fe": ["wyn"] } }
}
```

- **Balance:** settlements now have a carrying capacity by land type, granaries have limits, and large families grow more slowly, so worlds stay healthy for centuries; AI rulers turn surplus gold into soldiers.
- **Battle controls:** easier division selection (tap the formation, a soldier, or the officer's banner) and clear orders: the order in flight pulses gold with a countdown, and an order icon floats over each of your divisions.

## 2.1: a huge world

- **Continents and islands:** worlds are now up to 180 × 120 cells (about five times the old Enormous), with two to four named continents and a scatter of islands. Cultures settle far apart, so each continent feels different.
- **Ports and sailing:** coastal settlements have docks, bigger ones a lighthouse. Reaching another landmass means riding to a port and taking ship; you, armies, spies and caravans all sail, and you can watch the ships cross the sea. Realms with harbours sometimes war across the water.
- **Territories:** every patch of land belongs to its nearest settlement, which is what borders, spies' routes and local events use.
- **Named wilds:** big forests, marshes, mountains, frozen wastes and badlands have names (the Raven Grove, the Bone Spine). Their monsters carry the name, and the deadliest have names of their own.
- **The land changes:** earthquakes open caves that monsters crawl out of, summer wildfires burn forests back to open land, and spring floods turn coastal fields to marsh. Any of them can wipe out a village.
- **Map:** only the part of the map on screen is drawn, so big worlds stay smooth; continent names show when zoomed out and wild names up close; the Stats tab lists the lands and wilds.
- **New art from the HAS pack:** the sailing ship, docks, lighthouse and the cave entrance.

## 2.2: live, map-first play

- **The map is the main screen.** You land on it when a game starts or loads, and the camera follows you. Pan away to look around, then tap **⌖ You** to come back.
- **Real time:** one month passes every minute (this was two minutes in 2.2), shown as a day count and a bar under the date. ❚❚ pauses the whole world. There are no more skip buttons: you control yourself, not time.
- **Smooth movement:** armies, fleets, caravans, spies and you glide across the map through the month instead of jumping.
- **Officers on the march** each ride with a couple of their soldiers, so a host shows who leads it.
- **Two ways in:** start on the first day of Year 1, or be dropped into a world that has lived through a random 30 to 100 years.
- **The world waits only when it must:** for your battles, a duel challenge, or the end of your line. Everything else arrives as a notice while time keeps running.

## 2.3: knowledge and the cartographer's map

- **Fog of war:** you start knowing only the land around you (and your own realm, if you rule one). Everything else is blank parchment. Land you travel through stays drawn on your map for good, and your spies and agents chart the roads they take.
- **Maps go out of date:** when an earthquake, wildfire or flood changes an area, word reaches you that your maps of it can't be trusted, and that land fogs over until you see it again.
- **Limited knowledge of realms:** you know the great kingdoms of the age and anything whose holdings you have seen. Locals tell you about the realms around them when you arrive somewhere. The Realms tab lists only what you know of.
- **Limited knowledge of people:** you know your own circle, the rulers of realms you know, the truly famous, and anyone whose deeds have reached you. News of great events travels everywhere; lesser news reaches you only if it's about someone you know. The Chronicle and the People tab follow the same rules.
- **Titles must be discovered:** you learn what titles someone holds by meeting them, hearing of their deeds, or having a spy bring back the names and titles of their whole court. Stats still shows world numbers, but only the titles you've discovered.
- Saves from before 2.3 keep knowing the whole world.

## 2.4: Dynasty Warriors battles

- **Bases:** every war battle has 3 to 5 bases a side, laid out by the land (a 1-1-1 line through mountain passes, a wide 3-2 on open plains, and so on). The attacker must burn the defender's **main camp**; if it still stands at nightfall, the attack has failed.
- **Garrisons:** each base is held by troops with no officer, up to 5,000 in the main camp, 2,500 in a fort and 1,000 in an outpost. They sleep until enemies come near, then fight and chase only a short way from their walls. An officer with 100 men who wanders into a post with 400 is in trouble. A base falls when its garrison is gone and your troops stand in it; a captured post sends a few men to hold it for you.
- **Where the numbers come from:** the defender's main camp is the town's own garrison, so the walls you pay for matter. Each lord also keeps a **reserve** of household troops, up to 5,000, which mans the other bases and takes the field.
- **The lord's reserve** takes simple orders for the whole body: **Defend** your bases, **Push** on theirs, or **Reinforce** an officer who is outnumbered.
- **Up to 8 officers a side,** each leading 100 to 1,500 troops set by Leadership and level. A realm with more officers fields its best 8.
- **Fire arrows hit bases too:** a volley over a palisade burns about 200 of its garrison, enough to make a weak post takeable.
- **Scale:** up to 30,000 troops on a field, with sleeping garrisons keeping the number actually fighting much lower. If a clash gets too heavy, the battle slows a touch instead of stuttering.
- **Camera:** zooms out to Mid at most. The officer cards at the bottom (with portraits) scroll sideways; tap one to jump to their troops. When watching, the camera follows the fighting.
- **On your You tab:** each officer's troop cap, your reserve (raise it with levies), and the garrison of each holding (fortify it with gold).
- **Practice:** the battle sandbox has base layouts too.

## 2.5: decisions, the court, and being there

- **Pace:** one month every minute (a session covers a few years; a reign is about six hours), and travel is about 2.5 times faster.
- **Decisions with deadlines:** matters that need you arrive as cards under 📜 at the top of the screen. Time keeps running; leave one too long and it is settled without you. Only battles, duels and the end of your line pause the world.
- **Your council speaks up:** each season your steward, captain and spymaster bring proposals: grain for a starving village, taxes, men for the war, walls for an exposed holding, locking down the gates against a plot, a spy in the enemy court.
- **Being there matters:** you can only rule from your seat. Ride out, travel or march with your army and your steward rules in your place, settling court business with their own judgment. The Court screen shows where you are and offers the road home.
- **Lead in person, or not:** choose whether you ride to war with your armies (big bonuses, real danger, and you're away from court) or let your officers lead.
- **Orders take time:** troops you levy, recruits for your officers and new garrisons arrive a month later.
- **Rulers and officers can travel** anywhere now, not just vagabonds.
- **New tabs:** Map · Court (Camp if you don't rule) · Household (you, your family, your successor, your honour) · Chronicle · World (realms, people and stats).
- **Portraits:** every character has a face from the HAS hero portrait sheets, matched to their culture and sex.

## 2.6: road encounters and petitions

Something now needs you every couple of minutes, wherever you are. Each one is a 📜 card with real consequences.

- **On the road:** bandits demanding a toll (pay, fight, or lose a month going around), a wounded knight (nurse them and they may ride with you, or rob them and earn a name), travelers with news of far-off realms (or a rough map for a few coins), monster tracks to follow and mark, storms at sea, starving villages along the way.
- **At court:** envoys offering alliance, the merchants' guild asking for a charter, a peasant accusing one of your officers, two officers feuding over the vanguard, a renowned wanderer asking to serve, a shrine for the people, refugees at the gate, a bandit chief offering to swear fealty.
- **In camp:** a merchant hiring guards, a tavern brawl, dice by the fire, veterans offering to drill your troops, gifts from fellow officers, and, if you serve a lord, orders you can obey or refuse.
- Your Charisma, Intellect and Might decide how some of them go.

## 2.7: ceremonies

The big moments of a life are now small scenes, drawn in HAS art in front of your realm's own castle, with the people involved (and their portraits) and a choice that matters. They wait under 📜 like any matter: tap **Attend** when you're ready.

- **Coronation:** when you take a throne, your officers swear to you one by one. If one refuses to kneel, demand their oath (Charisma against theirs), strip their rank before everyone, or let it pass.
- **Weddings:** yours or your children's. A lavish feast wins hearts and fame; inviting your rivals can soften old grudges.
- **Funerals:** for your spouse, children, parents, sworn sibling and the ruler you succeed. A grand funeral calms the realm; if they were killed, you can swear vengeance over the grave.
- **Oath-swearing:** seal a brotherhood in blood for a bond that only death breaks.
- **Knighting:** when you grant a rank, the officer kneels before the court; gift a warhorse and they'll remember it.
- **Feasts:** hold one from the Court (50 gold, twice a year at most). Usually your officers drink to your name. Sometimes a rival mocks you before the hall: duel them, answer with wit, or have them thrown out.

## 2.8: meetings, diplomacy and missions

- **Envoys:** from the Court's new 🕊 Diplomacy panel, send an envoy (10 gold) with an offer: an alliance, a five-year truce, or a demand for tribute; peace terms in a war; or a marriage match for one of your children. The envoy rides the map (you can watch them go) and the answer comes when they arrive. Your Charisma, fame and what their ruler thinks of you decide it; demanding tribute from someone braver than they are wise can start a war.
- **Audiences:** travel to another ruler's seat and request an audience in person. Being there counts for more than any envoy. Without a realm of your own, you can offer your service or ask for news of the realm.
- **Missions for officers:** if you serve a lord, they send for you: scout a rival's seat (and bring back its court's names and titles), carry a letter to another ruler, hunt down a bandit troubling the realm, or come to council. Obey and you're paid and trusted; refuse or fail and your lord remembers.
- **Your counsel matters:** summoned to council, your lord asks what the realm should do: war, peace or stronger walls. With good Intellect and their trust, they may listen.
- Officers and lords now bring their own troops when they fight bandits, not just a wanderer's band.

