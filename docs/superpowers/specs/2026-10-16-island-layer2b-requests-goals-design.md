# Island — Layer 2b: Requests, Daily Goals, Stockpile, Map Names

Builds on Layer 2 (the group). Same design rule: **mouse only, one click per decision, systems run themselves.** If the player ignores something, people decide on their own based on who they are.

## 1. Requests (one person or a small group)
- **Who and how often:** 1–2 per day across the camp, never more than one open at a time per person. A person with something to ask walks to the leader, waves, and gets a **❗** above their head (also shown on their party/roster entry).
- **Answering:** click them → their speech bubble shows the request with **2–3 answer buttons on the bubble**. One click answers. No other menu.
- **Ignored:** after ~60s (game time scaled) they act on their own by trait: hothead/brave → does it anyway, lazy → drops it, loner → goes alone, kind → asks again later. Ignoring costs a little trust with that person.
- **Kinds:**
  - **Ideas** (go do something): fish off the rocks, build a signal fire, raid the wreck for supplies, set up a rain catcher, climb for a lookout, mark SOS on the beach, check a rumor alone.
  - **Questions** (how you answer matters): "Is anyone coming for us?", "Why did you send *him* out?", "Can we leave the fire on all night?". Reactions depend on traits — honest people value a straight answer, scared people want comfort.
  - **Disputes** (two people): "Dan took my shoes." → side with A / side with B / "Sort it out yourselves." Relationship and trust shifts; low-trust people side with your rivals.
  - **Secret-driven:** "I saw Lena hiding food." → confront / let it go (ties to hoarder, fakeJob, runaway secrets).
- **Good and bad ideas:** every idea has a hidden quality from the asker's real skill, traits and secret (a fake medic offering to set a bone, a coward volunteering to scout far, a liar's "I saw fruit up there"). **Spotting a bad one is the challenge.** Tells:
  - What you've learned about them (revealed skill/secret on their card).
  - Their **track record** on the card ("Ideas: 2 worked, 1 didn't").
  - How they ask: hesitation, over-selling ("Trust me, it's easy"), avoiding eye contact (turns away), or another person's reaction bubble ("…him? Really?").
- **Outcomes** play out over time and are visible:
  - Success → a **camp prop** appears (signal fire, drying rack, rain catcher, lookout post, SOS stones, a separate sleeping spot), stockpile goes up, a discovery/rumor marker, a skill reveal.
  - Failure → wasted day, nothing gained, sometimes a hurt person or lost stock, a secret slips.
  - Either way: trust with the asker, mood, relationships, and a **journal line** with the result.
- Saying **no** to a good idea also costs: they're disappointed, and they may bring it up at the campfire.

## 2. Daily goal (the whole group)
- **At dawn** everyone gathers at the fire. **3 cards** show possible goals for the day, each pitched by a person (portrait + one line). One click picks it. After ~20s with no pick, the most trusted pitcher's goal wins.
- **Goals come from the current situation:** head for a "?" marker, stock up food, fetch water, rest and heal, search for someone missing, build a prop someone suggested, patch up a feud.
- **During the day** everyone in camp (not in your party) works toward it on their own with visible animations; your party gets a small bonus toward it.
- **At dusk:** a result line ("We filled the stockpile." / "No sign of Tom."), trust up if met, small grumble if not.
- Picking someone's pitch makes them happy; ignoring the same person's pitches several days running leads to grumbling.
- Requests and the daily goal are separate: the goal is the group's plan, requests are side jobs by one or two people that still affect everyone.

## 3. Stockpile
- A visible pile by the fire: **fruit, coconuts, shellfish, fish, water jugs.** Piles grow and shrink; **no numbers, no meters**.
- Grows from gathering (camp life, daily goals, ideas). Shrinks at the evening meal (everyone sits and eats — new eat animation) and from bad outcomes (spoiled, dropped, stolen).
- **Empty stockpile:** moods drop, grumbling, trust slides. **No starvation or death until Layer 3.**
- A hoarder secret quietly takes from it; that's what a "hiding food" report is about.

## 4. Place names on the map
- **Fully zoomed out:** all known places show map-style labels (name + small icon).
- **Zoomed in:** a name only shows when the camera is near it, or on hover.
- **Rumors:** short label on the "?" marker ("? something big — Maya").
- **Minimap:** hover a dot to see its name.

## 5. Layer 2 leftovers
- Click a scout's **trail** or their **roster entry** to follow them with the camera.
- **Pairs** refuse to be split for long: they ask to go together (a request), or slip away to find each other.
- **Low trust:** people side with your rivals in disputes.

## Animations and sounds
New: eat (sitting, hand to mouth), wave-for-attention, hesitate (shuffle, look away), build/hammer, carry-to-pile, drop-on-pile, prop pop-in. Sounds: attention call, good/bad outcome stings, pile clunk.

## Out of scope
Exhaustion (dropped by request), hunger death, building menus, save/load (Layer 3).

## Tech notes
- `src/life/requests.ts`: request templates, quality roll, ask/ignore/outcome timers, track record.
- `src/life/goals.ts`: dawn goal generation, day job assignment, dusk result.
- `src/life/stock.ts`: stockpile counts + pile sprites; props as new sprite DEFS.
- UI: bubble buttons in `social.ts`; goal cards reuse the leader-pick card style; zoom-based label rules in `drawLabels`.
- Tests: quality roll matches traits/skills; goal options depend on state; stock never goes negative.
