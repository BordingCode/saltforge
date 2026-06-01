// Turn-based hero-vs-creature combat. Pure functions over the run state's hero + a creature.
// One "exchange" = hero strikes, then (if alive) the creature strikes back. Seeded via the
// shared run RNG isn't needed here — damage is deterministic from stats (small variance optional).
import { WEAPON_ATK, ARMOR_DEF, FIGHT_VIGOR } from '../config.js';
export function heroAttack() { return WEAPON_ATK[0]; }
export function exchange(hero, creature) {
    const atk = WEAPON_ATK[hero.gear.weapon] ?? WEAPON_ATK[0];
    const arm = ARMOR_DEF[hero.gear.armor] ?? 0;
    const heroDmg = Math.max(1, atk - creature.def);
    creature.hp = Math.max(0, creature.hp - heroDmg);
    if (hero.vigor > 0)
        hero.vigor = Math.max(0, hero.vigor - FIGHT_VIGOR);
    let creatureDmg = 0;
    const creatureDead = creature.hp <= 0;
    if (!creatureDead) {
        creatureDmg = Math.max(1, creature.atk - arm);
        hero.hp = Math.max(0, hero.hp - creatureDmg);
    }
    const heroDowned = hero.hp <= 0;
    const log = creatureDead
        ? `You strike for ${heroDmg}. ${creature.name} falls.`
        : `You hit for ${heroDmg}; it claws back ${creatureDmg}.`;
    return { heroDmg, creatureDmg, creatureDead, heroDowned, log };
}
// Fleeing: a parting hit (reduced by armor), no vigor cost.
export function flee(hero, creature) {
    const arm = ARMOR_DEF[hero.gear.armor] ?? 0;
    const dmg = Math.max(0, Math.ceil(creature.atk / 2) - arm);
    hero.hp = Math.max(0, hero.hp - dmg);
    return dmg;
}
