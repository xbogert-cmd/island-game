# Island Game: Layer 2 Design (The Group)

## Layer 2 goal
Wake up at the crash with 12–16 strangers, and become the person they follow. Pick your leader, walk the island with a small party, send scouts out, find the landmarks, and watch the camp talk, argue and settle in on its own. Building, crafting and research come in Layer 3 and later. Layer 2 is about **people, leading, scouting and discovery**.

## Design rule: simple controls, systems that run themselves
- **The whole game plays with the mouse.** Left-click and right-click only. Keys (pan, rotate, zoom, pause) stay optional.
- **Your movement is the command.** If you walk, your party follows. If you stop, they spread out and search. If you whistle, they regroup. You never need a menu for hand signals.
- **Nobody waits for orders.** Survivors live their lives without input. The player only steers.
- **Challenge comes from decisions:** who to bring, who to send, where to go, when to turn back, and who to believe. It never comes from the controls.
- **No tutorial screens.** A small hint pill appears once, the first time something becomes possible, and is never shown again.

## Controls (complete list)
| Input | Effect |
|---|---|
| Left-click ground | You walk there; your party follows in a loose group |
| Left-click a survivor | Opens their card with **Come with me** (or **Go back to camp** if already in your party) / **Go scout** (then click a direction on the map) |
| Left-click a "?" rumor or a known place | You walk there with your party |
| Left-click yourself | **Wait here** (party stays). Click again: **Follow me** |
| Right-click anywhere | **Whistle**: party runs back to you |
| Standing still for ~2 s | Party automatically **spreads out and searches** nearby |
| Roster button (optional) | List of everyone, with the same Come / Scout buttons, plus **Find** (camera jumps to them) |
| Existing keys | WASD/drag pan, scroll zoom, Q/E rotate, Space pause |

The camera follows you by default. Panning away detaches it, and clicking your portrait snaps it back.

## Start of game
1. A short crash intro: the camera drifts over the wreck and the fire, and survivors stir.
2. **Pick your leader** from 3 random survivors. Each card shows the person's name, portrait, 2 visible traits, their backstory line, and a hint ("?") that they are hiding something.
3. The leader stands up, the rest look at them, and play begins. The day tally on the fuselage shows 1 mark.

## People
Each survivor is generated from the seed:
- **Name, look** (skin, hair, clothes colors reusing the existing sprite system), **age group**.
- **Backstory from the flight:** one line, e.g. "Flight nurse heading home", "Business class, won't say why", "Traveling with her brother". Each backstory carries a **hidden skill** (medic, navigator, climber, fisher, mechanic, cook, storyteller…). It is revealed the first time it matters (the nurse treats a hurt scout, the navigator's rumors are always accurate), with a popup and a journal line.
- **Traits** (2–3, visible): brave / cowardly, honest / liar, kind / selfish, hard-working / lazy, calm / hothead, curious, loner, social. Traits shape behavior: speed of scouting, rumor accuracy, how willing they are to follow you, and who they get along with.
- **One strength and one weakness** (visible): e.g. "fast walker" / "afraid of the dark", "sharp eyes" / "can't swim", "strong" / "bad knee".
- **Secret (hidden trait):** about 1 in 3 people has one, e.g. hoarding food, lied about their job, a fear they hide, or knowing someone else on the flight. A secret reveals itself through an event (caught at the campfire, blurted out in an argument, or discovered on a scouting trip). It shifts relationships and trust.
- **Pairs who arrived together:** 2–3 pairs per game (siblings, couple, coworkers, parent and teen). Pairs stay close, worry when the other is away, and refuse to be separated for long. Splitting them up costs mood.
- **Mood:** a small icon over the head appears only when it's notable: 😊 happy, 😟 worried, 😠 angry, 😢 sad, 😨 scared, 💤 tired, ❤ fond of someone nearby. No numbers on screen.
- **Relationships:** every pair of people has a hidden score (−100…100). It moves with shared trips, arguments, secrets, and trait clashes (hothead vs. calm, liar vs. honest).
  - **Friends** walk together and sit together.
  - **Rivals** argue, with an animated shouting bubble and maybe a shove.
- **Survivor card** (on click or hover):
  - Portrait, name and backstory.
  - Traits, strength and weakness.
  - Revealed skills.
  - Mood, plus a one-line reason ("Misses her brother, who is out scouting").
  - Trust in you (shown as a word, not a number: Loyal / Trusts you / Unsure / Doubts you / Against you).
  - Top friend and rival.

## Trust (simple version)
Each person has trust in the leader (0–100).
- **Rises** when your party or scouts find water, food spots, shelter or landmarks; when you rescue someone; when you bring people home safe.
- **Falls** when a party member is hurt on your trip, when you separate pairs, when you lead people somewhere dangerous at night, when you send someone who's scared, or when trips find nothing for a long time ("you're not good enough").
- **Effects:**
  - Low trust: they hesitate before following ("…fine."), sometimes refuse a scouting trip, grumble at the fire, and side with your rivals.
  - High trust: they follow instantly and volunteer for scouting.
- Survivors also hold opinions about each other, which is the tension system above. Layer 4 later expands trust into ideas, research and challenges to your leadership.

## Leading
- **Party:** up to 5 people with you. They walk in a loose cluster with pathfinding around cliffs, water and trees, and go up and down slopes.
- **Auto-search:** when you stop, the party fans out within ~12 units, looks around (an animated searching pose), and comes back. If something is in range (a landmark, water source or fruit trees), one of them calls out "Over here!" and points.
- **Whistle:** a sound plus a ring animation. Everyone in the party within earshot drops what they're doing and jogs back.
- **Wait here / follow:** waiting party members sit down where they are and idle. Clicking yourself again calls them.
- **Torch at night:**
  - After dusk, you and your party carry torches automatically. Each torch is a point light with flicker and embers.
  - Animals keep their distance, and scared people stay calmer near a torch.
  - Scouts out at night without a torch move slower and are more likely to get lost.

## Scouting
- **Sending:** click a survivor, then **Go scout**, then click a direction. They walk off with a dotted trail and leave footprints in sand and mud.
- **The scout decides how far to go** based on traits: brave scouts go far, cowards turn back early, and curious scouts wander. They come home to report.
- **Rumors:** returning scouts report with a speech bubble and a journal line, and a **"?" marker** appears on the map and minimap. The marker is fuzzy, a circle where the thing might be. Accuracy depends on who you sent:
  - **Brave or honest scouts:** accurate, a small circle in the right spot.
  - **Cowards:** exaggerate ("a monster in the trees!"), bigger circle, scarier description.
  - **Liars:** sometimes invent something that isn't there.
  - **Navigator skill:** always accurate.
- **Watching:** click a scout's trail or their roster entry to make the camera follow them. Clicking your portrait snaps back.
- **Trouble:** scouts can get **lost** (they wander in circles and their trail fades) or **hurt** (a fall at a cliff or a wild boar, and they limp or sit). A red **"!" marker** appears at their last known spot. Go there with your party, and once they're found they're helped home. Rescue gives a big trust boost. Leaving someone out overnight drops trust for everyone, and their friends get angry.
- Scouts discover landmarks for the map, but only you get the full first-sight moment.

## Discovery
- **Visible but unknown:**
  - The whole island shape is visible on the minimap from the start.
  - Landmarks are hidden until someone sees them.
  - Unvisited areas on the minimap are slightly dimmed and brighten as anyone walks there.
- **First-sight moment:**
  - The first time you see a major landmark (giant tree, ruins, radio tower, shipwreck, volcano crater, tail section, abandoned camp, waterfall, hot springs), the game slows briefly and the camera eases toward it.
  - A title card fades in (e.g. "THE RUINS").
  - Your party reacts with bubbles ("Whoa…").
- **Naming:** after a first sight, a small prompt offers a suggested name ("The Old Stones"). **One click accepts it**, or you can type your own. That name appears on the map, in the journal and in survivor dialogue.
- **Journal:** a book button. It auto-writes a log of the story so far: discoveries, scout reports, rescues, revealed secrets and skills, arguments, and notable campfire moments. Entries are grouped by day, read-only, with no management.
- **Clue chains** (Layer 2 has 2–3 chains; the full payoff of what's found comes in later layers):
  - **Tail section:** debris trail clues lead from the crash toward the tail. You find a suitcase, then a seat, then the tail. Inside is a stash such as a flare gun or first-aid kit, shown as a discovery for now.
  - **Earlier survivors:** a note at the abandoned camp points toward the radio tower. A logbook at the tower mentions the ruins.
  - **Shipwreck:** a captain's map fragment hints at a cave.
  - Each clue is a discovery popup and a journal line, and updates a "?" marker toward the next one.

## Camp life (runs on its own)
- **Daytime idle life near camp:** people wander, sit, talk in pairs, fetch water from the nearest source once known, collect fruit and shellfish from known spots (simple animations, no inventory yet), and nap in shade at noon.
- **Night:** everyone gathers at the fire (already in place).
  - **Campfire talk bubbles** run 1–3 at a time, based on relationships and recent events:
    - Friends joke.
    - Rivals snipe.
    - Someone worries about a missing scout.
    - A secret slips out.
    - Someone praises or doubts the leader, depending on trust.
  - Bubbles are short pixel speech bubbles with icons and a few words.
- **Day tally:** a scratch is carved on the fuselage each morning (visible on the hull sprite) and shows in the HUD next to the day count.
- **Sleeping:** people sleep under the lean-tos and in the fuselage, curled up, with "z" particles.

## UI additions
- **Leader portrait** (bottom left): shows mood and trust summary. Clicking it centers the camera.
- **Party strip** next to it: small portraits of who is with you, plus scouts out (with a direction arrow).
- **Roster button**: a scrollable list of everyone (portrait, mood icon, trust word, where they are). The same click actions work here.
- **Journal button.**
- **Toasts** (top center) for events: "Mia found fresh water!", "Leo is lost in the north."
- **Minimap:**
  - Fog-of-unknown dimming.
  - "?" and "!" markers.
  - Named landmarks.
  - Dots for your party and for scouts.

## Animation list (everything moves)
Walk, run, limp, sit, sleep, search (crouch and look), point, wave, whistle (leader), carrying a torch, shove/argue, cheer, sad slump, startled jump, fetching water (bucket bob), collecting (crouch-pick), and a talk-bubble pop. Plus footprints and the dotted trail.

## Sound additions (generated, zoned like Layer 1)
Whistle, footsteps by ground type, torch crackle, short voice "murmur" blips for speech bubbles (pitch per person), a discovery chime and first-sight swell, alarm notes for "!", and campfire crackle that gets louder when the camera is near.

## Out of scope for Layer 2
- Building, crafting, research and orders to build (Layer 3–4).
- Hunger and thirst meters, and death (Layer 3). Hurt scouts recover over a day.
- Births (Layer 6).
- Save and load: noted for Layer 3; a session is one play-through for now.
- Leader death or replacement (Layer 4+).

## Tech notes
- New modules in `src/life/`:
  - `persona.ts`: generation of names, traits, backstories, secrets, pairs and relationships from the seed.
  - `brain.ts`: per-person behavior state machine (idle/camp, follow, search, scout, lost, hurt, sleep, talk).
  - `trust.ts`: trust and relationship deltas from events.
  - `scouting.ts`: trips, rumor generation and markers.
  - `discovery.ts`: seen-landmark tracking, first-sight, names, clue chains and journal entries.
- **Pathfinding:** A* on a coarse walk grid (2×2 cells) built from height, slope and water, with a path cache. Long trips use waypoints.
- `people.ts` is extended for sprites, new poses and mood icons. Torches are pooled point lights (max ~8 lit at once).
- Input is in `src/ui/input.ts`: raycast the terrain for clicks, and pick people by projected sprite bounds.
- An event bus connects them (`events.ts`): discoveries, rumors, rescues and secrets feed trust, the journal, toasts and campfire talk.
- Tests (Vitest):
  - Persona generation is deterministic per seed.
  - Pathfinding avoids water and cliffs.
  - Rumor accuracy follows traits.
  - Trust deltas apply as specified.
