## 1. General Layout

* Plain UTF-8 text, one fixed-width line per map row (\~600 columns today).
* Every visible glyph is either:

  1. Terrain (the ground the player walks on), or
  2. Annotation (labels for realms, provinces, POIs, etc.—these never appear in-game).

Any ASCII printable character not listed under **Terrain Glyphs** is automatically treated as annotation.

---

## 2. Terrain Glyph Legend

| Glyph                 | Terrain Type                   | Movement Notes                                 |   |
| --------------------- | ------------------------------ | ---------------------------------------------- | - |
| ` ` (space/back-tick) | Open land / plains             | Baseline cost                                  |   |
| `~`                   | Hills & gentle uplands         | Slower than plains                             |   |
| `^`                   | Mountains / highlands          | Very slow; often impassable                    |   |
| `&`                   | Forest                         | Slightly slow                                  |   |
| `%`                   | Swamp / marsh                  | Much slower; dangerous                         |   |
| `=`                   | Deep water / sea or large lake | Impassable to foot travel                      |   |
| `-`                   | River (E - W flow)             | Crossable only at bridges/fords                |   |
| \|                    | River (N - S flow)             | as above                                       |   |
| `.`                   | Road / paved way               | Faster than plains                             |   |
| `+`                   | Bridge or Ford                 |                                                |   |
| `@`                   | River / road annotation marker | Acts as underlying terrain (usually open land) |   |

**Direction clues:** `-` suggests east-west flow, `|` suggests north-south.

---

## 3. Annotation Language (Labels)

Annotations carry world lore but are stripped out before the game renders the map.

| Syntax                         | Semantic Level                       | Example                      | Intended Scope                            |
| ------------------------------ | ------------------------------------ | ---------------------------- | ----------------------------------------- |
| `[NAME]`                       | Realm / kingdom                      | `[Gondor]`                   | Large; may span rivers & mountains        |
| `(NAME)`                       | Province / march                     | `(Anórien)`                  | Sits inside a single realm                |
| `?Name`                        | Natural region (plains, waste, etc.) | `?Dead_Marshes`              | Ecological / geographic zones             |
| `!Name`                        | Point-of-interest (city, ruin, fort) | `!Minas_Tirith`              | One tile only                             |
| Bare Name inside terrain patch | Named terrain feature                | `Mirkwood` inside `&` forest | Stays within contiguous identical terrain |

### Placement Rules

* Each annotation is a contiguous run of characters bounded by whitespace or other terrain glyphs.
* It sits on top of whatever terrain glyph(s) it overwrites.
* For large homogeneous features (e.g., mountain ranges or great forests), the bare name is written inside that patch; it covers only that patch and nothing beyond it.

---

## 4. Rivers, Roads & Bridges Nuances

* Rivers use `-` and `|`.
* Roads are represented by `.`; a bridge or ford is represented by `+`.

---

## 5. Whitespace

* A literal space (0x20) represents open terrain, the same as `"`.

