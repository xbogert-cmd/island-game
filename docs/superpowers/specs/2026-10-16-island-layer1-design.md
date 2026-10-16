# Island Game: Layer 1 Design (The Island)

## The game, in one paragraph
Plane-crash survivors on a large island. You are the person they listen to: you lead a small party around the island Pikmin-style while the camp runs and grows on its own. Discoveries you show them become habits, orders are goals rather than blueprints, unknown orders turn into research, and trust decides whether they follow you. The long arc runs from crash to camp, village, town and beyond, across generations. The game is built in layers, and each layer is playable. **This doc covers Layer 1 only: the island itself.**

## Layer 1 goal
Open the game and explore a large, beautiful, living island. Watch a full day turn into night and a storm roll in. It must look as good as the v2 look-test or better. Survivors are placed at the crash site but only idle; group control is Layer 2.

## Look (locked)
- **The "3D v2" style.** Real 3D terrain with pixel-art ground texturing, stepped (toon) lighting, rounded blob trees, and 2D pixel sprites (side view) for people and animals. Rendered at low resolution and scaled up with crisp pixels.
- **Pixel filter (black outlines + dither) is a setting, off by default.**
- **Vibrant, saturated palette:** rich greens, bright turquoise shallows, warm sand.
- **Fixed zoom levels** (for example 3–4 steps), so ground pixels and sprite pixels stay the same size. The camera rotates in 90° steps and snaps to the pixel grid.

## The island
- **Size: large.** About 5–6 minutes for a person to walk across: an island of about 640×640 world units in a 768×768 ocean. Every new game gets a different seed, and seeds can be replayed.
- **Shape:** an organic main island, not a circle, with bays, peninsulas, one lagoon side and one cliff side. Three to five small **islets** sit offshore, out of reach until boats exist.
- **Dormant volcano**, roughly central: a tall forested mountain, rocky near the top, with a **crater lake**. **Hot springs and steam vents** on its flanks hint that it isn't fully asleep. (Becoming active is a later layer.)
- **Biomes:** mostly **jungle, grassland and beach**, broken up by smaller patches of **rocky highland, mangrove/swamp, bamboo groves, flower fields** and **tide-pool rocks**.
- **Elevation:** terraced plateaus with cliff faces, rolling hills, and the volcano rising above everything.
- **Water:**
  - **Rivers** start in the highlands and the crater lake and flow downhill to the sea, with **waterfalls** where they cross cliffs.
  - A **lagoon with a coral reef**: sheltered turquoise water inside a reef ring, with waves breaking on the reef.
  - **Sea cliffs** on one coast, with **cave entrances** in the cliff faces. Entrances only; caves open up later.
  - **Tides** slowly raise and lower the sea over the day, revealing **sandbars and tide pools** at low tide.
- **Landmarks** (placed now, with story later):
  - **Ancient ruins** with weathered statues, deep in the jungle.
  - An **old wooden shipwreck** on the reef or a beach.
  - An **abandoned camp** from earlier survivors.
  - A **rusted radio tower** on a high point.
  - A **giant ancient tree** towering over the jungle, visible from far away.
- **Crash site:**
  - The main **fuselage on a beach**, with **one wing in the shallows** and a short trail of debris and suitcases nearby.
  - **The tail section lies far away in the jungle**, as a discovery for later.
  - Optionally, one **engine** sits in a second remote spot.
  - The crash cuts a scar of broken trees on the way in.

## Alive
- **Wildlife** is ambient for now (no hunting yet), shown as pixel sprites placed where each animal belongs:
  - **Beach:** crabs scuttling, sea turtles, seagulls overhead.
  - **Water:** fish in the lagoon and reef (visible in shallows), jumping fish, dolphins offshore, and a rare whale breach.
  - **Jungle:** parrots and birds that burst out of trees as you pass, monkeys in the canopy edge, frogs near rivers.
  - **Grassland:** wild boar, deer.
  - **Flowers:** butterflies. **Swamp:** dragonflies. **Night:** fireflies, bats, an owl.
  - Animals react to people, and flee when someone gets close.
- **Wind** moves trees, grass and palms. Clouds drift and cast **cloud shadows** across the land.
- **Ambient sound** is generated in code (no audio files): waves, wind, birds by day, insects and frogs at night, rain and thunder. A mute toggle is included.

## Time and weather
- **Clock HUD** styled like the reference ("☀ DAY 1 – 06:00"). A day lasts about 12 real minutes at 1×. Speed controls: pause, 1×, 2×, 4×.
- **Day/night:** sunrise and sunset colors. Nights are dark, lit by the campfire, fireflies and the moon. Shooting stars are rare.
- **Weather** changes on its own between clear, cloudy, rain and storm. Storms bring heavy rain, gusts, lightning, rough sea and dark skies. Morning fog sits in valleys, and a rainbow sometimes follows rain.

## UI (Layer 1)
- A clock and day counter, plus time-speed buttons.
- A **minimap** of the whole island with a camera rectangle. Click it to jump there.
- A settings panel: pixel filter (off by default), sound on/off, and a seed with a "New island" button.
- Controls: drag or arrow keys to pan, scroll to change between the fixed zoom levels, Q/E to rotate.

## Architecture
- **Vite + TypeScript + Three.js** (installed locally, so it works offline). It runs in the browser on a Mac and can be wrapped as a Mac app later.
- `src/world/`: seeded island generation that produces height, biome, moisture, river and landmark data. Pure data with no rendering, so it can be tested.
- `src/render/`: terrain chunks built near the camera, a ground shader that draws pixel-art texturing procedurally from world position (so it scales to a large island without huge textures), instanced trees and props with wind sway in the shader, water and tide, sky and lighting, weather effects, the post filter, and the camera.
- `src/life/`: ambient wildlife that spawns and despawns around the camera.
- `src/sim/`: the clock, weather state, and the people placeholder. It runs on a fixed tick, separate from rendering (this matters for later layers).
- `src/ui/`: the HUD, minimap and settings.
- `src/audio/`: the procedural ambience.

## Performance target
A smooth 60 fps on a recent Mac at the default zoom. Only nearby chunks, trees and animals exist in the scene, and the far ones are released.

## Testing
- Unit checks on world generation:
  - A seed always produces the same island.
  - The island has a coastline, a volcano and crater lake, rivers that reach the sea, all landmarks placed on valid ground, and the crash site on a beach.
- Visual verification by running the game and taking screenshots of day, night, storm, every biome and every landmark.

## Out of scope for Layer 1
Leading people, scouting, needs, building, trust and research (Layers 2–4); the volcano erupting; entering caves; hunting; boats.
