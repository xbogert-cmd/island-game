# Leader pass: the camp runs itself, you get your hands dirty

**Status:** approved 2026-10-18 (controls, time and extras decided; see sections 2, 6 and 7).
**Comes before:** Layer 5 (other people on the island, eruption, ending).

## Why

Play gets boring because the player is a manager: the main thing to do is find work for people.
This pass flips that. The camp runs its own days; the player sets where it is heading and then
goes out and *does* things only the leader can do.

**Done means:** a camp left alone for three days stays busy with no clicks and doesn't fall apart,
and in a normal play hour the player spends most of their time on hands-on actions, the evening
meeting and choices, not on job menus.

## 1. The camp runs itself

- **No idle people.** Anyone free with useful work in reach takes it. Jobs, builds and crews already
  autofill; this closes the gaps (idle adults, builds waiting on nobody, routine requests).
- **Routine requests stop asking.** "Can I go gather?" type asks are just done. Only big things still
  come to you: ideas, traditions, couples, newcomers, and the hard choices (section 4).
- **Direction.** A standing focus that you set, kept until you change it:
  - **Food & water**, **Build**, **Explore**, **Comfort** (rest, mood, sick care), **Defend** (cat, storms).
  - It weights job autofill and which builds get queued next. Set from the CAMP page any time, or at the
    evening meeting.
- **The daily plan moves to the evening.** The three pitches that happen at dawn today are made at the
  evening meeting instead, as "tomorrow's plan". Mornings are free for you to go out.
- The JOBS page and manual assignment stay, for when you want to override something.

## 2. Hands-on actions (leader only)

### Controls
The mouse does what you press on:
- **press on the ground:** walk, same as now;
- **press and hold on an animal or fish:** stop and aim, with an arc showing the throw; release to throw;
  Esc cancels. Out of range, clicking the animal walks you into range first;
- **near a herd:** walking is a quiet sneak automatically; double-click the ground to run (fast, spooks them);
- **during a timing ring:** click anywhere, or press Space;
- right-click still whistles, and dragging still moves the camera.

### Time
Any hands-on action drops the game to 1x. Timing rings run in slight slow motion (about 0.5x) while
they're up, then speed comes back.

Two kinds of input, depending on the action:

- **Aim (throwing):** hold on the target to draw the spear back, release to throw. The longer you hold, the
  farther and straighter it goes, up to a limit. Moving targets need leading.
- **Timing ring (everything else):** a ring closes on a marker; click when it's in the sweet spot. Bigger
  rewards have smaller sweet spots and faster rings.

The leader gets better with practice: each action has its own small skill (like job xp) that widens
sweet spots and steadies throws.

### Spear fishing (aim)
Needs a spear. Stand in shallows, the lagoon or a river, then click near a fish shadow to start aiming.
Fish dart when you miss. Hit: the fish goes into stock (bigger fish in the lagoon and reef).

### Hunting (aim, then timing)
Needs a spear. Animals now come in herds (section 3). Walking keeps them calm, running spooks the herd.
Throw at one: a clean hit drops it, a graze sends it off wounded with a blood trail you can follow.
A boar may charge back, which turns into a timing ring (dodge or strike). Your crew helps if they're with
you: they flank, so the herd runs toward you.

### Fights (timing)
When the cat attacks someone nearby, or a boar charges, you can step in: a short run of strike/dodge rings.
Win: the animal is driven off or wounded (the cat gets the existing `wounded` state).
Lose: you get hurt.

### Climbing (timing)
Climb spots: cliffs, the tops of waterfalls, the giant tree, tall palms, and later the volcano rim.
Climbing is a run of holds, one ring each. One miss is a slip; two misses and you fall and get hurt.
At the top: you can see a wide area of the map, plus a find (nests/eggs, coconuts, a crate, a view of
somewhere no one has found yet).

### Caves
Cave landmarks already exist. Going in needs a torch. A short series of timing beats: a narrow squeeze,
a drop, a dark turn. There's something worth having at the end (scrap, old castaway gear, a clue toward an idea).

### Search and rescue
Sometimes someone working away from camp doesn't come back by dusk: they're lost, hurt, or both.
You get where they were last seen. Follow their footprints, find them, and walk them home before full dark
(the cat hunts at night). If nobody goes, they may still make it back, or they may not.

### Working beside them
Stand at a job or build site and lend a hand (build sites already allow this; extend it to every job).
While you work there, the job goes faster, people nearby are happier, and they learn faster.

## 3. Animals: sizes and herds

- **Size reflects the animal.** Redraw the bigger animals at real size next to a person (sprites are 20×26):
  boar, deer, turtle, monkey, goat, and the dog. Nothing gets smaller than it is now; small things
  (crabs, frogs, birds, insects, chickens) stay as they are.
- **Groups unless solitary:**
  - boar: sounders of 3–6, with piglets;
  - deer: herds of 4–8;
  - monkeys: troops of 4–8;
  - birds: flocks;
  - fish: schools;
  - dolphins: pods of 2–4;
  - crabs: scattered groups;
  - solitary: turtle, owl, whale, the cat.
- A herd moves together and spooks together: one runs, they all run.

## 4. The evening meeting and hard choices

### Evening meeting (most nights)
At dusk, unless a ceremony, tradition, showdown or funeral is on, people gather at the fire for a short meeting:
- **Reports:** two or three people say how things are going, from real numbers: food days left, who is sick,
  what got built, a complaint, something good.
- **Tomorrow's plan:** the three pitches (moved from dawn). Pick one, or let the most trusted pitch win.
- **Direction:** change it here if you want.
- Skippable: if you're away from camp, they hold it without you and the most trusted plan wins.

### Hard choices (only when it fits)
These come up at the meeting, only when something real happened. No schedule.

| Choice | When it happens | You decide |
|---|---|---|
| **Theft** | Food goes missing and someone was hungry or is dishonest | Punish, forgive, or ration everyone |
| **A fight** | Two people with bad blood come to blows | Side with one, make them work together, or split them up |
| **Medicine** | More very sick people than herbs | Who gets it |
| **A slacker** | Someone has skipped work for days | Talk to them, give them a job they like, or cut their share |
| **Someone wants to leave** | A person who is unhappy and has low trust | Let them go, ask them to stay, or make them a promise |

People remember how you judged them, through trust, relationships and mood. A promise you don't keep counts
against you later.

## 5. Danger to the leader

- Missed strikes, charges and falls hurt you, using the existing `hurt` state: you're slower, and you
  need the sick bay.
- You only die from repeated recklessness: getting hurt again while already badly hurt. Then the existing
  succession takes over.

## 6. Extras for hunting

- **Carry the kill home.** A deer or boar is heavy: the leader walks slower carrying it, or hands it to a
  crew member. Bringing a big kill into camp gets a cheer and a little trust.
- **Hides and trophies.** Hunted boar and deer leave a hide in stock. Hides make bedding: warmer huts,
  and people sleep and recover better. Your first kill of each kind hangs as a trophy by the fire, and
  people point it out in chatter.
- **Teach someone.** Anyone in your crew while you spear fish, hunt or climb learns that skill. After
  about three trips they can do it themselves: spear fishing and hunting improve their jobs, and
  climbers fetch from climb spots.

## 7. Deeds and the cat

- **Your deeds become legend.** Big moments (a boar or deer kill, driving off the cat, a rescue, a climb
  to a new top, a cave cleared) are written down as deeds. The storyteller tells them at the fire and at
  meetings, and they count toward your record in a leadership challenge (the existing REMIND THEM WHAT
  I DID answer).
- **The cat stalks you.** When the cat is alive and you're out at night (torch or not), it sometimes
  follows you: two eyes catch the light at the edge of the dark. Stay out long enough and it may
  pounce, which starts a fight ring (section 2). A torch makes it keep its distance longer; your dog,
  if you have one, warns you.

## Code shape

New modules, following the existing `Group` hub pattern:
- `src/life/leader.ts`: the leader's actions (fishing, hunting, fights, climbing, caves, rescue) and their
  skill.
- `src/ui/action.ts`: the aim and timing-ring overlays, shared by every action.
- `src/life/meeting.ts`: the evening meeting, plus the hard choices (using the existing `Choice` box from
  politics).
- Wildlife herds: extend `src/life/wildlife.ts` with group spawning and shared fleeing.
- Direction: a field on `Group`; `jobs.ts` and `buildings.ts` read it for weighting.
- Saves: direction, leader skills and pending choices.

## Testing

- Unit tests:
  - timing-ring hit windows;
  - aim with lead on a moving target;
  - direction changing job weights;
  - choice triggers only fire when their condition is true;
  - leader death only from repeated hurt.
- Browser checks:
  - one of each action;
  - a herd spooking;
  - a meeting with a hard choice;
  - a three-day hands-off run where everyone stays busy and nobody dies of neglect.

## Not in this pass

Other people on the island, the eruption and the ending are Layer 5.
