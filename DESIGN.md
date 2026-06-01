# Saltforge — Design Document (v0.1, pre-build)

> Working title. Alternatives: *Hollow Frontier, Ironreef, Tidewatch, Dead Reckoning.*
> Private/personal game. Turn-based. Solo vs one AI rival. Offline PWA.
> Stack: **TypeScript + Vite + HTML5 Canvas** (lean engine), deployed static to GitHub Pages.

---

## 1. The pitch

You wash up on a foggy frontier with a single hero and a half-ruined **Keep**. Somewhere out
there in the same fog, a **rival** is doing exactly what you are: venturing out, stripping the
land for materials, fortifying, and forging cannons. Whoever finds and flattens the other's Keep
first wins. You never see their base — you fire **blind salvos at a hidden grid**, and the only
way to fire *smart* instead of *lucky* is to build up your **scouting** until guesses become
deductions.

The hook: it's a cozy explore-and-build game with a **Battleship knife-fight bolted onto the
end-game**, and a rival clock ticking the whole time so you can't just turtle forever.

---

## 2. The one thing that makes it work: three loops, one weld

The danger with "survival + builder + Battleship" is shipping **three disconnected minigames**.
Saltforge welds them with **one shared resource, one shared clock, one gating chain**:

```
        EXPLORE                 BUILD                  DESTROY
   (hero in the fog)   →   (base + gear)    →   (blind salvos on a hidden grid)
        ▲                       │                          │
        └───── better gear lets you explore deeper ◄───────┘
               deeper = the materials + AMMO the other two loops need
```

- **Shared currency:** everything reduces to **Salt** + 3 materials. Exploration *produces* them;
  base + gear + salvos *spend* them.
- **Shared clock:** the world runs on **steps**. Every step your hero takes, the rival's clock
  also advances on its own seeded timeline. Dawdling = letting the rival arm. There is no free time.
- **Gating chain:** *gear → lets you survive deeper bands → which drop better materials + the salvo
  ammo → which upgrade base & cannons → which let you scout + fire.* Starve any one loop and the
  other two stall. (That's the design test for every feature: does it keep all three live?)

---

## 3. The core loop (a single session, minute to minute)

1. **Plan the expedition.** From your base, look at the fog map. Pick a direction. Your hero has
   **Vigor** (a stamina bar, ~10 to start) for this trip.
2. **Venture out.** Tap an adjacent tile to step. Each step reveals fog around you and costs 1 Vigor.
   You find **resource nodes** (harvest for materials), **creatures** (turn-based fights), and
   **wrecks/caches** (loot, lore, map fragments).
3. **Push your luck.** Deeper tiles = better materials + the rare end-game ammo, but tougher
   creatures and faster Vigor drain. When Vigor runs low you **retreat** to base (or risk getting
   caught out).
4. **Come home & invest.** Spend the haul: upgrade a **building**, craft the next **gear tier**, or
   stockpile **salvo ammo**. This is the satisfying "numbers go up" beat.
5. **The rival ticks.** A **menace meter** shows how armed the rival is. Toasts telegraph its
   progress ("smoke rises from their forges"). The longer you take, the closer it is to firing on you.
6. **Mid-game: scout.** Build your **Watchtower** and spend ammo/turns on **scans** that return real
   clues about the enemy's hidden grid (which row is empty, hot/cold distance, a revealed cell).
7. **End-game: the salvo race.** Fire blind salvos (more shots/turn the more **Cannons** you've
   built) to triangulate and smash their **Keep** — while they fire back at yours. First Keep to
   zero loses.

Target session: **20–40 minutes**. The sawtooth (push out → retreat → upgrade) is the cozy rhythm;
the menace meter is the pressure that stops it being a relaxed builder forever.

---

## 4. The world

- **Shape:** a single procedurally-generated overworld (start ~**24×24 tiles**, scalable), your
  base anchored at one corner, the rival's somewhere far across the fog. Seeded, so a "daily" or
  shared-seed run is reproducible (reuses Warbound's `rng.js`).
- **Fog of war:** every tile starts hidden. Stepping reveals a small radius (a better **Lantern**
  tool widens it). Revealed-but-unoccupied tiles stay known; creatures can re-wander.
- **Danger bands (the risk/reward gradient):** distance from your base sorts the map into
  concentric bands — the heart of the RPG pull:

  | Band | Name        | Creatures        | Materials                | Vigor drain |
  |------|-------------|------------------|--------------------------|-------------|
  | 1    | The Shoals  | weak             | Salt, Timber             | low         |
  | 2    | The Marsh   | moderate         | Timber, some Iron        | medium      |
  | 3    | The Reach   | dangerous        | Iron, rare Salt veins    | high        |
  | 4    | The Saltmaw | brutal           | **Firesalt (ammo)** + Iron | very high |

  You *can't* meaningfully fight the salvo war without repeatedly braving Band 4 — which you can't
  survive without gear — which you can't forge without Band 2–3 materials. The bands ARE the
  progression.

---

## 5. Economy (deliberately small)

Four things, no more — legibility beats spreadsheet depth:

- **Salt** — soft currency. Common, used for nearly every action (small sink everywhere).
- **Timber** — early structural material (walls, early buildings).
- **Iron** — mid/late material (cannons, high gear tiers, hardened Keep).
- **Firesalt** — **the salvo ammo.** Drops only in Band 4. *This is the master valve:* you cannot
  snipe your way to victory without continuing to explore the most dangerous zone. It keeps all
  three loops live right to the end and kills turtling.

**Vigor** is the anti-snowball governor: it caps how much any single expedition can extract
*regardless of how rich you are*, so wealth can't be dumped into one mega-run. It also creates the
push/retreat sawtooth for free, with no death-screen needed — at 0 Vigor you simply must go home.

Sinks: buildings, gear crafting, scans, and salvos all consume materials/ammo, so there's never a
"nothing to spend on" lull.

---

## 6. The base (~6 buildings, small tech tree)

Each building maps cleanly onto **one** of the four roles, and three of them feed the Battleship layer:

| Building       | Role       | Effect                                                                 |
|----------------|------------|------------------------------------------------------------------------|
| **Keep**       | core       | Your loss condition. Upgrading adds HP and a larger "armored" footprint on your hidden grid (harder for the rival to finish). |
| **Saltern**    | economy    | Passive Salt trickle + raises your storage cap.                        |
| **Bulwark**    | defense    | Each level adds **decoy/wall cells** to your hidden grid → the rival wastes shots. |
| **Cannon Battery** | offense | **+1 salvo shot per turn** per level. Your rate of fire.               |
| **Watchtower** | scouting   | Unlocks tiered **scans** (clues about the enemy grid). The deduction enabler. |
| **Forge**      | gear       | Unlocks/crafts the next **hero equipment** tier.                       |

Small tech tree: buildings need materials **and** a prerequisite (e.g. Cannon Battery II needs a
Forge; Watchtower III needs Iron from Band 3). This pulls the player deeper into the world on a
schedule. (Possible 7th later: **Decoy Hull** / **Smithy** for more texture.)

---

## 7. The hero & gear (the RPG hook)

Three equipment lines, ~4 tiers each, each tier crafted at the Forge from band-appropriate materials:

- **Weapon** (I–IV): win creature fights faster / survive ambushes → reach deeper bands.
- **Armor** (I–IV): soak hits → survive deeper bands, raises effective Vigor in danger.
- **Tool / Lantern** (I–IV): faster harvest + wider fog reveal + more Vigor-efficient travel.

Gear is the gate: **Band 4 is suicide without Tier III–IV gear.** That's the explicit
"come back stronger" RPG promise, and it ties hero progression directly to the ammo supply.

---

## 8. The rival + the blind-attack endgame

**The rival is a clock, not an avatar.** It has its own hidden grid you never see directly. Its
power comes from a **fixed seeded income curve** — it does NOT peek at your board, so it can never
feel like a cheater.

- **Menace meter (0–100):** the rival's visible armament level. Crosses thresholds → **telegraph
  toasts**: *"Smoke rises from their forges"* (it armed a cannon), *"Their guns now range your
  shores"* (it can fire on you), *"Their scouts mapped the strait"* (its accuracy jumped). This is
  what makes turtling tense without rubber-banding your stats.
- **Difficulty = curve steepness + fire accuracy + blunder rate**, all honestly labelled — never
  secret stat buffs (same principle as Warbound's "difficulty = decision quality, not numbers").

**Battleship layer (where luck becomes deduction).** The enemy grid (~**8×8**) hides structures
(Keep = the 2×2 target, plus forges/walls). Plain blind shots ≈ a coin flip, which isn't a game —
so the **Watchtower tiers** convert luck into logic:

- **Scan I — line elimination:** "Row 4 holds 0 structures." (Constraint satisfaction.)
- **Scan II — hot/cold oracle:** distance-to-nearest-structure from a chosen cell. (Triangulation.)
- **Scan III — anchor reveal:** reveals one true structure cell. (A foothold.)

Better scouting = the player **chose** to make the deduction easier — difficulty inside the verb
itself. **The rival's fire-back AI** is the classic-but-fair **probability-density hunt** (it
targets the cells most likely to hold a structure) + **target mode** (after a hit, it works the
neighbours/line) + a **per-difficulty blunder rate** (on lower difficulty it misplays *on purpose*,
never gets buffed).

---

## 9. Difficulty & pacing

- **Run length:** ~20–40 min. **Ramp:** Act 1 explore/build (Bands 1–2) → Act 2 arm & scout
  (Band 3, Watchtower/Cannons) → Act 3 the salvo race (Band 4 Firesalt runs interleaved with firing).
- **Anti-snowball:** Vigor caps extraction; Firesalt is band-gated; the menace clock punishes
  over-investing in any single loop.
- **Onboarding (no tutorial wall):** the first ~3 expeditions are steered by soft objectives
  ("harvest 5 Timber", "build a Saltern", "forge a weapon") that teach one verb each. The Battleship
  layer is introduced only once the Watchtower exists, so the player meets it already equipped to
  reason about it.

---

## 10. Research grounding (design lineage)

- **Risk/reward depth gradient** — roguelike/extraction convention (the deeper-is-richer-and-deadlier
  band structure; "leave with the loot or push one more tile").
- **Fog of war + tech-gated expansion** — RTS lineage (Age of Empires): scouting as a resource,
  tech tree pulling you outward.
- **Gather → craft → upgrade compulsion** — survival-builder lineage (Minecraft/Don't Starve): tight
  material loops, visible "numbers go up," but kept *small* (4 resources) to stay legible on a phone.
- **Pacing sawtooth** — Left 4 Dead "AI Director" build-up/relax rhythm, expressed turn-based via the
  Vigor push/retreat and the menace clock.
- **Battleship-as-deduction** — plain Battleship is near-random; competitive solvers use
  **probability-density targeting**. We borrow that for the *rival's* AI and invert it for the
  *player* (clue tiers) so the player's hunt is logic, not luck.

---

## 11. The MVP (smallest thing that's already fun) + phased plan

**Phase 1 — Explore & gather core (the heart, must be fun ALONE):**
the tiled fog overworld, tap-to-move hero with Vigor, Bands 1–2, harvestable nodes for Salt/Timber,
the base with **Saltern + Forge**, the gather→upgrade-base→craft-gear loop. *No combat, no rival yet.*
If walking out, harvesting, and coming home to upgrade isn't satisfying on its own, nothing else
matters — so we build and playtest this first.

**Phase 2 — Danger & gear:** world creatures + turn-based fights, full gear lines, Bands 3–4, the
Vigor risk/reward teeth, Firesalt as a collectible.

**Phase 3 — The rival & the endgame (the payoff):** the hidden enemy grid, the rival clock + menace
toasts, Watchtower scan tiers, blind salvos + the probability-density fire-back AI, win/lose. **The
Battleship math is de-risked in a headless test harness BEFORE any UI** (brute-force shots-to-kill
across seeds × clue tiers, tune grid/structure/clue strength so weak clues are tense and strong
clues feel earned). Reuses Warbound's `test/` + `rng.js` approach.

**Phase 4 — Depth & polish:** more buildings/gear/biomes, daily/shared seeds, difficulty settings,
Web Audio juice (gentle, never harsh), how-to, add to the Bording Hub.

---

## 12. Biggest design risk + de-risk

**Risk:** the Battleship end-game feels like luck, *or* the three loops feel disconnected.

**De-risk:**
1. **The weld** (§2) — shared currency + shared clock + the Firesalt valve — is load-bearing and
   gets built in from Phase 1, not bolted on.
2. **The deduction harness** — prove in headless tests that good scouting reliably converts blind
   guessing into a winnable hunt, *before* drawing a single salvo on screen.

---

## 13. Tech notes

- **TypeScript + Vite + Canvas**, static build → GitHub Pages, PWA (offline) via service worker.
- **Reuse from Warbound** (ported to TS): `rng.js` (seeded mulberry32, `seedFromString`/`hashSeed`),
  `grid.js` (neighbours/BFS for fog reveal, bands, return-pathing), the audio approach, the headless
  test harness pattern.
- **Determinism:** all world-gen, rival income, and Battleship logic seeded — no `Math.random()`/
  `Date.now()` inside the sim (daily-seed date stringified once in UI). Enables reproducible runs +
  headless verification.
