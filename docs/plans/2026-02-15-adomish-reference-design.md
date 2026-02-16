# Adomish Game Reference Document

Comprehensive reference for the adomish dungeon crawler project (`../adomish`), documenting all game systems for potential integration into Mandos2.

## Overview

Adomish is a browser-based ADOM-inspired roguelike dungeon crawler. ~3,200 lines of vanilla JavaScript across 7 ES modules + 1 HTML entry point. No build system, no dependencies. HTML5 Canvas 2D rendering. All audio procedurally synthesized via Web Audio API.

### Module Architecture

| Module | Lines | Purpose |
|--------|-------|---------|
| `index.html` | 171 | Entry point, game loop, state management, equipment/key definitions |
| `js/audio.js` | 844 | All sound effects + fugue music system |
| `js/dungeon.js` | 523 | Maze generation, room carving, creature/item placement |
| `js/render.js` | 357 | Canvas rendering, raycasting visibility, HUD panels |
| `js/combat.js` | 251 | D&D 5e attack rolls, creature AI movement, healing |
| `js/input.js` | 269 | Keyboard handling, continuous movement, item interactions |
| `js/player.js` | 80 | Player stat generation, leveling, XP system |
| `js/creatures.js` | 93 | Creature database (5 types with full stat blocks) |

### State Management

Single mutable state object created in `index.html`, passed to all modules as function arguments. Rendering is event-driven (not continuous) -- full screen redraw triggered by player movement, combat actions, item pickups, and creature movement.

---

## D&D 5e Combat System

### Attack Roll Formula

**Player attacks creature:**
```
d20 + STR_mod + proficiency_bonus + weapon_toHit  vs  creature_AC
```

**Creature attacks player:**
```
d20 + creature_toHit  vs  player_AC
```

### Critical Hits & Fumbles

- **Natural 20**: Automatic hit regardless of AC. Damage dice are doubled (roll twice as many dice, then add STR mod once).
- **Natural 1**: Automatic miss regardless of bonuses.
- **Minimum damage**: All hits deal at least 1 damage (`Math.max(1, damage)`).

### Damage Formula

```
Normal hit:  roll(weapon.dice, weapon.sides) + STR_mod
Critical:    roll(weapon.dice * 2, weapon.sides) + STR_mod
```

### Ability Modifier

```
modifier = Math.floor((ability_score - 10) / 2)
```

| Score | Mod | Score | Mod |
|-------|-----|-------|-----|
| 2-3 | -4 | 14-15 | +2 |
| 4-5 | -3 | 16-17 | +3 |
| 6-7 | -2 | 18-19 | +4 |
| 8-9 | -1 | 20 | +5 |
| 10-11 | 0 | | |
| 12-13 | +1 | | |

### Combat Flow

1. Player bumps into creature (movement into occupied tile triggers attack)
2. `playerAttack()` rolls d20, calculates total, compares to creature AC
3. On hit: roll damage, apply to creature HP
4. On kill: leave bones (`%`), award XP, check level-up
5. After player action: `naturalHeal()` rolls 1d6 (heal 1 HP on a 6)
6. Then: `moveCreatures()` runs all creature AI (energy-based)
7. Adjacent creatures attack player automatically
8. Flash effects and combat log update

### Combat Intensity & Music

Music intensity scales with danger:
```
intensity = 0.6 + (1 - hp/maxHp) * 0.4
```
At full health: 0.6 intensity. Near death: 1.0. After 5 turns without combat, intensity drops to 0.15.

---

## Player System

### Stat Generation

Six ability scores generated via **4d6 drop lowest**: roll 4d6, sort, sum top 3. Range: 3-18 per stat.

Stats: STR, DEX, CON, INT, WIS, CHA.

### Starting Character

```
HP:          10 + CON_mod (Fighter d10, max at level 1)
AC:          10 + DEX_mod (unarmored)
Proficiency: +2
Weapon:      0 (Unarmed)
Armor:       0 (Unarmored)
Potions:     0
```

### Proficiency Bonus by Level

| Levels | Bonus |
|--------|-------|
| 1-4 | +2 |
| 5-8 | +3 |
| 9-12 | +4 |
| 13-16 | +5 |
| 17+ | +6 |

### XP & Leveling

**Thresholds:** 0, 100, 300, 900, 2100 (5 levels max)

On level up:
1. Proficiency bonus updated
2. **Ability Score Improvement**: +1 to two random stats (cap 20)
3. AC recalculated from new DEX
4. **HP increase**: roll 1d10 + CON_mod (min 1). Both maxHp and current hp increase.

### Healing

- **Natural**: 1-in-6 chance per turn to heal 1 HP
- **Potions**: Drink with `P` key. Heals 2d6 (2-12 HP). Costs a turn. Requires potions > 0 and hp < maxHp.

---

## Creature System

### Creature Database

| Creature | Char | Color | Zone | AC | HD | Attack | toHit | XP | Speed |
|----------|------|-------|------|----|----|--------|-------|----|-------|
| Rat | `r` | #a86 | 0 | 10 | 1d4 | 1d1 bite | +0 | 10 | 35 |
| Kobold | `k` | #c66 | 1 | 12 | 2d6 | 1d4 dagger | +4 | 25 | 30 |
| Goblin | `g` | #4f4 | 2 | 15 | 2d6 | 1d6 scimitar | +4 | 50 | 25 |
| Skeleton | `s` | #ddd | 3 | 13 | 2d8 | 1d6 shortsword | +4 | 50 | 25 |
| Ogre | `O` | #fa0 | 4 | 11 | 7d10 | 2d8 greatclub | +6 | 450 | 20 |

Each creature also has full D&D ability scores (STR, DEX, CON, INT, WIS, CHA).

### HP Rolling

```
hp = sum(roll hd.count times: 1d(hd.sides)) + (CON_mod * hd.count)
minimum 1 HP
```

### Energy-Based Movement

Each turn, creatures accumulate energy equal to their speed. When energy >= PLAYER_SPEED (30), they act and spend 30 energy. Fast creatures (Rat, speed 35) can act multiple times per turn. Slow creatures (Ogre, speed 20) skip some turns.

### AI Behavior

- **Visible to player** (visibility state 2): Sort 8 directions by Manhattan distance to player, move toward closest.
- **Not visible**: Random walk (Fisher-Yates shuffle of 8 directions).
- **Adjacent to player** (including diagonals): Attack instead of moving. Ends creature's turn.
- **Blocked by**: Walls, closed doors, other creatures, keys on ground, the star.

### Creature Sighting

Each creature has a `sighted: boolean` flag. When first seen (visibility === 2 and !sighted), a unique sound plays and `sighted` is set to true.

---

## Equipment

### Weapons

| Index | Name | Dice | Sides | toHit | Color | Char |
|-------|------|------|-------|-------|-------|------|
| 0 | Unarmed | 1 | 4 | +0 | none | - |
| 1 | Short Sword | 1 | 6 | +2 | #666 | `\` |
| 2 | Long Sword | 1 | 8 | +4 | #aaa | `\` |
| 3 | Great Sword | 2 | 6 | +4 | #ddd | `\` |

Auto-equip on pickup if `weaponIndex > current`. Weaker weapons ignored.

### Armor

| Index | Name | AC Type | Base AC | Speed (ft) | Color | Char |
|-------|------|---------|---------|-----------|-------|------|
| 0 | Unarmored | dex | 10 | 30 | none | - |
| 1 | Leather | dex | 11 | 30 | #864 | `]` |
| 2 | Studded Leather | dex | 12 | 30 | #a86 | `]` |
| 3 | Chain Mail | flat | 16 | 25 | #aaa | `]` |
| 4 | Plate Mail | flat | 18 | 20 | #ddd | `]` |

- **DEX-based**: AC = base + DEX_mod
- **Flat**: AC = base (no DEX bonus)
- Speed affects movement rate: `moveRate = Math.round((30 / speedFt) * 125)` ms per tile
- Auto-equip on pickup if `armorIndex > current`.

### Potions

Displayed as `!` in bright red (#f66). Auto-pickup increments `player.potions` counter. No stacking limit. Drink with `P` key for 2d6 healing.

### Item Placement

- 3 weapons placed behind progressive doors (Short Sword behind door 0, etc.)
- 4 armors placed behind progressive doors
- 25 potions scattered randomly on reachable floor tiles

---

## Dungeon Generation (Brief)

The door/key gating system is specific to adomish and not directly applicable to Mandos2, so this section is kept brief.

### Core Algorithm

1. Recursive backtracker maze on 51x51 grid (25x25 logical cells)
2. Carve up to 12 rooms (30% large 5-9 tiles, 70% normal 3-5 tiles)
3. Connect rooms to corridor network (exactly 1 doorway each)
4. Find chokepoints via flood-fill reachability
5. Place 4 colored doors at chokepoints, 4 matching keys in reachable zones
6. Place star (goal) behind final door
7. Place weapons/armors in progressive zones, 25 potions randomly
8. Spawn creatures by zone (distance-based difficulty scaling, 1-3 per room)
9. Place 1 ogre within 2 tiles of star (boss guard)
10. Retry up to 50 times if solvability check fails

### Tile Types

- `#` wall (impassable)
- `.` floor (walkable)
- Entities (doors, keys, creatures, items) are overlays on floor tiles, stored in separate arrays

---

## Procedural Audio System

All audio is procedurally synthesized via Web Audio API. Zero audio files.

### Fugue Music Engine

A 3-voice D minor fugue (bass, tenor, alto) built from pre-composed musical phrases arranged in an 8-section form that loops infinitely.

#### Musical Structure

**Key**: D minor. **Form**: 8 sections x 8 beats = 64 beats per cycle.

| Section | Name | Content |
|---------|------|---------|
| 1 | Exposition A | Bass plays subject alone |
| 2 | Exposition B | Tenor enters with answer (+7 semitones); bass plays countersubject |
| 3 | Exposition C | Alto enters with subject (+12); tenor plays countersubject |
| 4 | Episode 1 | Descending sequence using subject head motif |
| 5 | Middle Entry | Subject in subdominant area (G minor, +5 semitones) |
| 6 | Episode 2 | Suspension figures over dominant pedal (A) |
| 7 | Stretto | Overlapping subject entries (imitation tightens) |
| 8 | Cadence | V->i harmonic resolution, loop point |

**Subject** (D minor, 8 beats):
```
D3(2) E3(1) F3(2) E3(1) C3(1) D3(1)
MIDI: 50, 52, 53, 52, 48, 50
```

**Answer**: Subject transposed up perfect 5th (+7 semitones).

**Countersubject**: Contrary motion rhythm against subject:
```
A3(1) G3(1) F3(2) G3(1) A3(2) F3(1)
```

#### Synthesis

**Bass & Tenor**: Custom PeriodicWave (dark pipe organ, emphasized odd harmonics). ADSR envelope: 30ms attack, 100ms decay, 0.7 sustain, 150ms release. Detuned copy at +4 cents for warmth. Bass has lowpass at 800Hz, tenor at 2000Hz.

**Alto**: Sine/triangle oscillator, softer envelope for ornamental figuration.

**Audio Graph**:
```
Voices → Per-voice Gains → Dry Bus (0.7) → Compressor → Master Gain → Destination
                         → Reverb Send (0.3) → Convolver (2.5s IR) → Compressor
```

Compressor: threshold -20dB, ratio 4:1, attack 3ms, release 150ms.

#### Intensity Control

Intensity parameter [0.0-1.0] controls:

**Voice count** (2-second fade):
- < 0.2: 1 voice (bass solo)
- < 0.45: 2 voices
- >= 0.45: 3 voices

**Master gain**: `0.08 + intensity * 0.20` (range 0.08-0.28), 0.5s ramp.

**Ornamental figuration** (intensity >= 0.3): Fast passing notes between main beats using D minor scale steps. Subdivision density increases with intensity (eighths at 0.3, triplets at 0.5, sixteenths at 0.7).

#### Scheduler

Two-clock architecture: JavaScript `setTimeout` every 25ms schedules notes 150ms ahead using Web Audio's sample-accurate `currentTime`. Base tempo 54 BPM (~1.11s per beat).

### Sound Effects Catalog

All effects are instantaneous synthesis: create oscillators/noise, apply envelopes and filters, play and auto-stop.

| Sound | Trigger | Duration | Synthesis | Character |
|-------|---------|----------|-----------|-----------|
| Player Hit | Attack hits | 100ms | Highpass noise sweep (2000->500Hz) | Snappy thwack |
| Player Miss | Attack misses | 150ms | Bandpass noise (1000Hz, Q=2) | Quiet whoosh |
| Goblin Hit | Enemy damages player | 120ms | Lowpass noise (400Hz) | Dull thump |
| Goblin Blocked | Enemy blocked | 80ms | Swept sine (1200->800Hz) | Metallic ting |
| Goblin Death | Enemy killed | 400ms | Swept sawtooth (200->50Hz) | Low moan |
| Pickup | Item collected | 120ms | Swept sine (600->1200Hz) | Bright ding |
| Drink Potion | Potion consumed | 260ms | 4 staggered sines (400-1000Hz, 60ms apart) | Harp arpeggio |
| Door Open | Door unlocked | 250ms | Bandpass noise creak + square click | Wood creak + latch |
| Heal | Natural heal | 150ms | Swept sine (880->1100Hz), gain 0.03 | Delicate ping |
| Full Heal | Reach max HP | 200ms | 3 staggered sines (880-1320Hz) | Harmonic chime |
| Player Death | Player dies | 1000ms | Swept sawtooth (150->30Hz) | Falling into abyss |

### Creature Sighting Sounds

Unique per-type, played once on first visual contact:

| Creature | Synthesis | Character |
|----------|-----------|-----------|
| Rat | Sine 800->1200Hz, 200ms | Quick squeak |
| Kobold | Bandpass noise 2000Hz, 200ms | Reptilian hiss |
| Goblin | Triangle 150->100Hz, 200ms | Low grunt |
| Skeleton | Highpass noise 2000Hz, 200ms | Bone rattle |
| Ogre | 3-layer: 2 sawtooths (40Hz, 55Hz) + bandpass noise (400Hz), 1500ms | Deep roar |

### Ambient Drips

Random water drips every 2-8 seconds. Sine wave at random pitch (800-2000Hz), sweeps down to half pitch over 80ms. Gain 0.04 (very quiet). Creates dungeon atmosphere.

### Volume Mixing

| Source | Gain Range | Notes |
|--------|-----------|-------|
| Fugue music | 0.08-0.28 | Scales with intensity |
| Combat SFX | 0.1-0.3 | Prominent feedback |
| Ogre roar | 0.35 peak | Loudest effect |
| Player death | 0.25 | Dramatic |
| Ambient drips | 0.04 | Background atmosphere |
| Heal sounds | 0.025-0.15 | Subtle |

SFX route directly to destination (no shared bus). Fugue has its own master gain + compressor + reverb chain.

---

## GUI Layout

### Canvas Dimensions

```
Width:  PANEL_WIDTH + MAZE_W * TILE_SIZE + PANEL_WIDTH = 140 + 714 + 140 = 994px
Height: MAZE_H * TILE_SIZE + HUD_HEIGHT = 714 + 30 = 744px
```

- TILE_SIZE = 14px (square tiles, 1:1 aspect)
- Font: "14px monospace" for maze, "12px monospace" for panels, "11px monospace" for combat log
- Canvas centered in viewport via flexbox, fixed size (not responsive to window resize)

### Three-Panel Layout

```
┌──────────────────────────────────────────────────────────┐
│ HUD: Keys [6][6][6][6]                          v0.2.0  │ 30px
├──────────┬──────────────────────────────┬────────────────┤
│          │                              │                │
│  Player  │                              │   Monster      │
│  Stats   │         51x51 Maze           │   Stats        │
│          │                              │  (when in      │
│  140px   │         714x714              │   combat)      │
│          │                              │                │
│          │                              │   140px        │
├──────────┴──────────────────────────────┴────────────────┤
│ Combat log: "You attack Goblin: d20+8=23 vs AC 15 — HIT!"│
└──────────────────────────────────────────────────────────┘
```

### Left Panel (Player Stats)

Vertical layout from top:
```
@                          (bright green player icon)
[====HP Bar====]           (green >50%, yellow >25%, red <25%)
HP: 25/30
AC: 15
Long Sword                 (weapon color)
1d8 +4 (+6)               (dice, bonus, total)
Studded Leather            (armor color)
Speed: 30 ft
Potions: 3                 (bright red)
Lv 3
[====XP Bar====]           (blue fill)
XP: 425/600
STR: 16 (+3)
DEX: 14 (+2)
CON: 15 (+2)
INT: 10 (+0)
WIS: 12 (+1)
CHA: 9 (-1)
```

Flash effects: 2px stroke border (red for hits, blue for misses), 3-frame timer with +/-2px screen shake.

### Right Panel (Monster Stats)

Only visible when: focusedCreature exists, creature alive, combatIdleTimer < 5, creature currently visible.

```
Goblin                     (creature color)
[====HP Bar====]           (same color scheme as player)
HP: 8/10
AC: 15
```

Same flash effects as player panel.

### Rendering Order

1. Black background
2. HUD bar (keys + version)
3. Left/right panels
4. Maze tiles (walls #fff visible, #444 remembered; floors #888 visible, #444 remembered)
5. Doors (colored by key, `+` closed, `/` open)
6. Keys (`6` char, colored)
7. Creatures (type char + color when visible, #444 in memory)
8. Star (`*` yellow)
9. Bones (`%` gray)
10. Weapons (`\`), Potions (`!`), Armor (`]`)
11. Player (`@` bright green, or dance frames, or dark red corpse)
12. Game state overlays (win/death)
13. Combat log text

---

## Fog of War / Visibility

### 3-State System

- **0 (Unseen)**: Never explored. Not rendered (black).
- **1 (Remembered)**: Previously visible. Rendered in dark gray (#444).
- **2 (Visible)**: Currently in line of sight. Full color.

### Raycasting Algorithm

360 rays cast per update (one per degree), sight radius of 8 tiles.

1. Demote all state-2 tiles to state-1
2. For each degree 0-359:
   - Calculate ray direction: `dx = cos(angle), dy = sin(angle)`
   - Start from player center: `(playerX + 0.5, playerY + 0.5)`
   - Step 8 times along ray
   - Mark each tile as visible (state 2)
   - Stop if wall `#` encountered (wall itself is revealed)
   - Stop if closed door encountered

---

## Input System

### Controls

| Key | Action |
|-----|--------|
| Arrow keys / WASD / Numpad 2468 | 4-directional movement |
| Numpad 1379 | Diagonal movement |
| Numpad 5 | Wait (pass turn) |
| P | Drink potion |
| Enter | Restart (when dead/won) |

### Continuous Movement

Key-hold triggers immediate move + repeating interval at `getMoveRate()` (125ms base, adjusted by armor speed). Multiple simultaneous keys supported -- releasing active direction switches to most recently pressed remaining key.

### Turn Sequence (per action)

1. Validate move (collision check)
2. Open doors if player has key
3. Pick up items (keys, weapons, armor, potions)
4. Check win condition
5. Natural healing roll
6. All creatures move/attack
7. Flash effects tick
8. Combat idle timer increment
9. Visibility recalculation
10. Creature sighting check
11. Full screen redraw

### Bump-to-Attack

Moving into a creature tile triggers `playerAttack()` instead of movement. Player does not move into creature's tile.

---

## Color Palette

### Structural
- Background: #000, HUD/panels: #111

### Visibility
- Visible walls: #fff, remembered: #444
- Visible floors: #888, remembered: #444

### Player & Combat
- Player: #0f0, death: #800
- Hit flash: #f44, miss flash: #48f

### Creatures
- Rat: #a86, Kobold: #c66, Goblin: #4f4, Skeleton: #ddd, Ogre: #fa0
- Remembered (all): #444

### Items
- Weapons: #666 / #aaa / #ddd (greyscale progression)
- Armor: #864 / #a86 / #aaa / #ddd
- Potions: #f66 visible, #622 remembered
- Keys: Red #f44/#622, Blue #48f/#226, Green #4f4/#262, Yellow #ff4/#662
- Doors: Same as keys
- Star: #ff0 visible, #444 remembered

### UI
- HP bar: #0c0 >50%, #cc0 >25%, #c00 <25%, background #400
- XP bar: #44f fill, #004 empty
- Text: #888 labels, #aaa values, #ccc combat log, #555 version

---

## Design Documents

The adomish project has 11 design documents in `docs/plans/`, all dated 2026-02-14. They document the iterative design from a simple maze explorer through to the full D&D 5e creature system:

1. **Maze Game** (design + plan): Core maze generation, fog of war, movement
2. **Rooms, Creatures, Keys, Doors** (design + plan): Puzzle complexity, solvability
3. **Combat System** (design + plan): D&D combat, weapons, potions, Web Audio SFX
4. **Fugue References** (2 docs): Web Audio API techniques + algorithmic counterpoint theory
5. **Creature System** (design + plan): ES module refactor, 5 creature types, D&D 5e stats
6. **Creature Improvements** (plan): Sighting sounds, energy-based speed, ogre boss

### Key Design Principles from adomish

- **Procedural everything**: Dungeons, audio, music -- no external assets
- **D&D 5e faithful**: Real attack formulas, ability modifiers, proficiency
- **Progressive difficulty**: Zone-gated creatures scale with exploration depth
- **Responsive audio**: Music intensity tracks game danger in real-time
- **Minimal UI**: ASCII characters convey all game information
- **Zero dependencies**: Runs by opening HTML file in a browser
