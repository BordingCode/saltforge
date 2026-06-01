# Saltforge

A turn-based frontier game. Explore a fog-shrouded world with a single hero, gather materials,
forge your hold and your gear — then find and sink a hidden AI rival's Keep by firing blind
salvos at its grid (Battleship), before its guns find yours.

**Play:** https://bordingcode.github.io/saltforge/

## The three loops
1. **Explore & gather** — step into the fog (each step costs Vigor and advances the rival's clock),
   harvest Salt / Timber / Iron, fight creatures, brave the deep **Saltmaw** for **Firesalt** (cannon ammo).
2. **Forge** — spend the haul on buildings (Saltern, Forge, Cannon Battery, Watchtower, Bulwark)
   and hero gear (Weapon / Armor / Lantern) so you can survive deeper and shoot straighter.
3. **Strike** — scout the rival's hidden grid with Watchtower scans (turning luck into deduction)
   and fire salvos until their Keep is rubble. They fire back. First Keep to fall, loses.

## Tech
TypeScript compiled straight to browser ES-modules (`tsc`, **no bundler**) + HTML5 Canvas for the
world, DOM for the UI. Offline PWA, hosted free on GitHub Pages. Pure, **seeded** simulation —
same seed reproduces the whole run, and the headless harness brute-force-verifies fairness.

## Develop
```
npm install      # one dev dependency: typescript
npm run build    # tsc -> js/
npm run watch    # rebuild on save
npm test         # headless sim checks (world solvable + battleship is deduction, not luck)
```
Then serve the folder statically (e.g. `python3 -m http.server`) and open `index.html`.

See `DESIGN.md` for the full design.
