# Island — Layer 3: The Camp (3a) and Danger & Life (3b)

Builds on Layers 1, 2 and 2b. Design rules carried over:
- **Mouse only, no learning curve.** Systems run themselves; the player steers.
- **No numbers on screen.** State shows as piles, words (Plenty/Low, Novice/Expert) and animation.
- **Everything is animated.**
- **The player never places anything.** You decide *what*, the camp decides *where* (always somewhere sensible).
- **One difficulty.** Nights stay as they are (no skipping).

Split in two so each half is playable on its own: **3a – The camp**, then **3b – Danger and life**.

---

## 3a — The camp

### Saving
- Autosaves at every dawn, every 60 s of play, and when the tab is closed or hidden. Never more than a few seconds lost.
- One save per island seed (localStorage). The last played island is remembered.
- Start screen: **CONTINUE** (shows day and leader) if a save exists, else the usual leader pick. **NEW GAME** (same island) and **NEW ISLAND** in Settings as now.
- Saved: clock, weather lock, leader, every person (position, mode, trust, hurt/heal, hunger, health, job, experience, likes, pin, owned hut), relationships, journal, known skills/secrets, discoveries (known, names), markers, explored map, stock, materials, buildings (progress, owners, shaky), build queue, job priorities, requests record, goals state, era.
- People out scouting when saved come back to camp on load ("made it back while you were away"); lost/hurt people stay lost/hurt with their red marker.

### Eras
- **THE CRASH** (start) → **THE CAMP** once fresh water and food are known. Title card moment like a first sighting ("THE CAMP — Day 3"), journal line, cheer at camp.
- In the Camp era morning plans start offering builds. (The Village era is Layer 4.)

### Materials
- **Wood, bamboo, stone, vines, plane scrap.**
- Sources are found like food spots: a woodland near camp (known from the start), bamboo groves (Bamboo biome), rock (highland/tide rock/volcanic), vine tangles (jungle), scrap (the wreck, always known). More sources show up through exploring and small finds (3b).
- Each has its own visible heap beside the food pile (logs, bamboo bundles, stones, coiled vines, scrap panels). Words only: Plenty / Enough / Low / Out (shown in the Jobs tab and on hover).
- Fresh food now spoils: each dawn fruit/fish/shellfish lose some (storage hut halves it, drying rack keeps fish). Snacks and coconuts keep.

### Jobs (all automatic)
- Jobs **appear only when they become possible**: Water (water found), Gathering food (food found), Fishing (fisher revealed, drying rack or fish trap built), Wood/Bamboo/Stone/Vines/Scrap (a source is known), Building (something in the build queue), Cooking (cooking spot), Night watch (watch fire), Tending the sick (sick bay). 3b adds Crafting, Hunting, Checking snares.
- **No numbers to set.** The camp staffs every job on its own from what is needed (water low → more water carriers; a hut waiting for wood → wood cutters; nothing to build → no builders).
- **Priority: one click** cycles each job **HIGH → NORMAL → LOW**. HIGH gets more people and fills first when hands are short; LOW gets fewer.
- **Shifts:** day jobs run ~6:30–18:30; Cooking around the evening meal; Night watch only at night, and whoever watched sleeps in the next morning (unavailable for day jobs). Rain slows outdoor work and people duck for cover now and then.
- **Who does what:** skill, experience, health and likes. Hurt/sick people are never picked. Assignments are sticky (people keep a job unless something better needs them) but can change through the day.
- **Friends are always put together before rivals** (like real people). Friends working together get a little more done and chat; rivals on the same job argue and slow down.
- **Experience:** every job has a level per person: Novice → Handy → Skilled → Expert (faster, better results). A person's real skill starts them at Expert in their job (fisher→Fishing, builder→Building, cook→Cooking, medic→Tending, mechanic→Scrap).
- **Teaching through work:** a Novice working the same job as an Expert learns twice as fast.
- **Likes/dislikes:** everyone has a job they love and one they hate, revealed on the roster after they've done it a while ("Loves fishing · Hates night watch"). Stuck on a hated job too long → grumbles at the fire, slacks sometimes (you see them stand idle).
- **Lead by example:** standing near people at work makes them faster and nudges their trust up. No extra control: you just walk over.
- **Favorite job (optional):** a button on a person's card, "KEEP ON FISHING", pins them to that job; click again to release.
- **Status words** per job: *Covered*, *Short-handed*, *Waiting for wood*, *Needs a source of stone*, *Too dark*, *Raining*, *Not needed*.
- People with no job: normal camp life (talk, rest, nap, wander). The old self-directed fetching/collecting/fishing is replaced by jobs.
- The daily plan adds extra hands to the matching job for the day.

### Building
- You choose *what* through morning plans ("BUILD A HUT") and requests ("We need a hut before the next rain"). It goes into the **build queue** (Jobs tab). Clicking an item moves it to the front.
- The camp chooses *where*, by rules:
  - Huts: a ring around the fire, spaced out, clear of the lean-tos and paths.
  - Storage hut: beside the food pile. Workbench and sick bay: on the camp edge, opposite each other.
  - Cooking spot: right by the fire. Racks: near the pile.
  - Fish trap: on the shore. Bathing spot: at the nearest known stream. Beacon: replaces the signal fire.
  - Fence: a ring around camp with a gate toward the shore; watch fire on the fence line facing inland.
- Builds go up in visible stages: stakes → frame → walls → done, with hammering builders, sawdust, and material carried in. Materials are taken from the heaps as each stage starts; a missing material pauses it ("Waiting for vines").
- **Builders vs improvisers:** if nobody skilled (builder skill or Expert builder) worked on it, there is a chance it is **shaky**: it can collapse in heavy rain or wind and needs rebuilding (toast, journal).
- **3a buildings:**

| Building | Needs | Does |
|---|---|---|
| Hut (sleeps 2, owned) | wood, bamboo, vines | Owners sleep there; dry in rain; better rest and mood |
| Storage hut | wood, vines | Food spoils half as fast; the pile moves into it |
| Workbench | wood, stone, scrap | Unlocks tool crafting (3b); repairs |
| Sick bay | bamboo, vines, scrap | Hurt/sick heal 2× (3× with a medic tending) |
| Cooking spot | stone, scrap | Meals cheer everyone; a cook stretches food further |
| Fish trap | bamboo, vines | Catches fish by itself each day |
| Fence (with gate) | bamboo, vines | Keeps boars and the cat out of camp (3b raids); can break and be repaired |
| Watch fire | wood, stone | Unlocks Night watch; scares the cat (3b) |
| Drying rack | wood, vines | Fish keeps; (already buildable from 2b ideas) |
| Rain catcher | bamboo, scrap | Water when it rains (already from 2b) |
| Beacon | wood, stone (needs signal fire) | Tall fire on the beach; sets up a later rescue storyline |
| Bathing spot | stone | Mood up; sickness down (3b) |

- 2b ideas (signal fire, SOS, lookout flag, drying rack, rain catcher) stay as they are and count as buildings.

### Requests in the Camp era
- Ideas now mostly **suggest new things to build or try** ("We should build a fish trap", "We need a storage hut, the fruit is rotting"). Yes → it joins the build queue and the asker throws themselves into it. The good/bad mechanic stays: a bad idea from an unskilled or over-selling person tends to come out shaky.

### GOALS box
- Shows the camp's biggest problems from the jobs system as things to fix: "Camp needs stone for the cooking spot — find rocks", "The fence is broken", "Food is spoiling — build a storage hut", "Nobody can be spared for the watch".

### Morning recap
- Before the plan cards: a short **YESTERDAY** card (what was found, gathered, built; who went hungry or got hurt). Click or wait to continue.

### People remember who saved them
- A rescued person becomes loyal to their rescuer: big relationship boost, their trust never drops below "Unsure" while the rescuer leads, and they take the rescuer's side in disputes.

### UI
- Bottom bar beside the leader panel: **PEOPLE** (tabs: Roster · Jobs) and **ISLAND** (tabs: Map · Journal). The top-right keeps only **?** and **SETTINGS**.
- Jobs tab: one row per job (name, ☀/☾ tag, priority word, small portraits of who's on it, status word), the build queue, and material words. The JOBS part of the button gets a NEW tag when a job appears.
- Roster shows each person's current job, experience words and known likes/dislikes.
- Hovering a building shows what it is, who owns it, what it does.

---

## 3b — Danger and life

### Tools
- **Knife, axe, spear, basket, rope.** Made at the workbench by the **Crafting** job, automatically when jobs need them (axes for wood cutters, spears for hunters, baskets for gatherers).
- How the camp learns them: skills (mechanic/builder know knives and axes), finds (a knife in the wreck, an axe in the tail section, spear carvings at the ruins), and copying (once one is made, anyone can make more).
- Effects: axe → wood 1.6×; basket → gatherers carry more; spear → Hunting job; rope → building faster; knife → scrap and hides.

### Hunting
- **Hunting** job (needs spears): hunters head into the jungle, track, chase, and come back with boar meat (and hides), sometimes empty-handed, sometimes hurt.
- New buildings: **Snares** (small game each morning, checked by a trapper), **Smoke rack** (meat keeps), **Hide rack** (hides cured into bedding: hut owners sleep better).

### Health, sickness and death
- Health words: Healthy → Weak → Sick → Very sick → (dead). Shown as a mood icon and on the roster.
- Causes: missed meals, no water, spoiled food, untreated wounds, a sick person in a crowded camp, no bathing spot.
- Recovery: food, rest, the sick bay, a medic tending.
- **Never a surprise:** before anyone dies there's always a sick icon, a toast, a GOALS line ("Maya is very sick — get her to the sick bay"), and visibly worse animation (slumped, limping, lying down).
- **Death is permanent.** A grave is dug at a quiet spot on the camp edge. At dusk everyone gathers for a **funeral**: time slows, the closest friend says a few words, people leave things at the grave. Friends grieve for days; trust drops (more if it was neglect). Their name keeps coming up at the fire.

### The big cat
- One apex predator lives on the island (lair in a cave or deep jungle).
- **It's a mystery first:** the first nights it only leaves signs (paw prints near camp, a missing fish, claw marks on a tree, glowing eyes at the edge of the torchlight). Only later does it threaten people.
- **Threat:** goes for people alone, especially at night away from fire; can raid meat from the pile if there's no fence. Mostly it injures; a kill is rare and follows warning signs.
- **Driving it off:** torches, the watch fire, a group shouting together, the night watch spotting it early.
- **Its name** comes from the camp: whoever tells the scariest story at the fire names it ("Old Smoke", "The Shadow").
- **The hunt is yours:** a morning plan or a brave volunteer's request starts it. You lead your party (spears needed) following its tracks to the lair. A slow-motion showdown; outcome from spears, bravery and numbers. Success: a lot of meat, a hide trophy in the leader's hut, a hero people talk about forever. Failure: someone badly hurt, the cat escapes and gets bolder.

### Boars
- Boars raid the food pile at night if there's no fence. The night watch shouts and drives them off.

### Chatter and small finds
- People talk about what's going on (the new hut, who went hungry, the hunt, a death, the cat) during the day and at the fire.
- While working, people notice **small finds**: a bamboo patch, a rock outcrop, bird eggs in the cliffs, paw prints by the river. They mention it, and a small marker appears on the map (a new material or food source, cat signs). Not a big discovery, no title card.
- **Rumors change as they spread:** a find gets retold person to person and details shift ("a few paw prints" → "the cat was IN camp!"). Liars invent some; honest people are reliable.

### Extras
- **Worn paths:** ground wears into dirt trails where people walk often.
- **Night watch** with personality: brave watchers spot things early; lazy ones nod off.
- **Owned huts:** each hut belongs to a person or pair (couples and family first, then friends, never rivals). Owners decorate a little (a flag in their shirt color, a hide).
- **Cat trophy and legend** (above).

---

## Out of scope
Lookout tower and spike traps (Layer 4), research by experimenting (Layer 4), villages/houses/farms/boats (Layer 4), seasons and storm damage beyond shaky buildings (Layer 5), births (Layer 6).

## Tech notes
- New modules in `src/life/`: `save.ts` (serialize/restore), `materials.ts` (sources + heaps; folded into `stock.ts` if small), `jobs.ts` (job list, auto staffing, priorities, experience, likes, work loops), `buildings.ts` (kinds, costs, site rules, queue, stages, shaky), `era.ts` (or inside goals), and in 3b `health.ts`, `cat.ts`, `tools.ts`, `chatter.ts`.
- 2b `CampProp` becomes `Building` (with progress 1 for instant 2b props).
- UI: PEOPLE/ISLAND pages in `social.ts`; the big map drawing moves to `ui/islandmap.ts`.
- Tests: auto staffing respects priorities, shifts and availability; friends paired before rivals; site rules give walkable, non-overlapping spots; save → load round-trips state; health never skips the warning stages.
