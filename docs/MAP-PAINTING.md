# Region-and-POI Resolution Algorithm

(as implemented in the most recent run)

---

## 1. Plain-language Overview

| Phase                            | What Happens                                                                                                                                                                                   | Why It Matters                                                                   |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **A. Pre-scan**                  | Read ASCII map and harvest:<br>- `[Realm]` seeds (square brackets)<br>- `(Sub-realm)` seeds (round brackets)<br>Also, copy the raw glyph grid to track original character positions.           | Seeds are the nuclei that "claim" surrounding tiles. Everything else is terrain. |
| **B. Water-label scrub**         | Flood-fill outward from every `=` tile. Any contiguous letters/underscores/apostrophes become part of the water body, retyped as water and later painted black.                                | Removes labels like "Sea of Rhûn", ensuring labels don't break the ocean mask.   |
| **C. Terrain-cost grid**         | Convert glyphs to integer traversal costs (e.g., plains: 1, forest: 8, mountains: 100).<br>Special edges:<br>- Rivers `-` cost 10 (crossable, slow).<br>- Open water `=` costs 50 (very slow). | Defines traversal difficulty for algorithm's pathfinding.                        |
| **D. First Voronoi pass**        | Multi-source Dijkstra run from all seeds (realms and sub-realms) simultaneously, assigning cells to the nearest seed by traversal cost.                                                        | Naturally partitions map according to terrain difficulty.                        |
| **E. Parent-realm pass**         | Repeat Dijkstra with only realm seeds to identify sub-realm positions and fill gaps left by Step D.                                                                                            | Establishes clear top-level borders.                                             |
| **F. Realm = core + sub-realms** | Assign sub-realm cells from Step D explicitly to their parent realms identified in Step E.                                                                                                     | Ensures consistent realm footprint combining cores and sub-regions.              |
| **G. Sub-realm subdivision**     | Run Dijkstra within each realm footprint seeded only by local sub-realms, leaving unclaimed cells as wilds of the parent realm.                                                                | Defines internal borders clearly.                                                |
| **H. Rendering**                 | - Paint sub-realms distinct shades of parent realm's hue.<br>- Paint water-mask cells black.<br>- Draw bold white realm contours.<br>- Annotate seed positions.                                | Produces final visual output.                                                    |

---

## 2. Mathematical Description

Define:

* **Graph**: $G = (V, E)$, 4-connected undirected.

  * $V = \{(r,c) \mid 0 \le r < H, 0 \le c < W\}$
  * $E$ connects orthogonal neighbors.
* **Terrain cost function**: $w: V \to \mathbb{R}^+$.
* **Realm seeds**: $S_{sq} \subset V$ (`[realm]`).
* **Sub-realm seeds**: $S_{rd} \subset V$ (`(sub-realm)`).
* **All seeds**: $S = S_{sq} \cup S_{rd}$.

Label each seed $s$ as $\ell(s)$.

### 2.1 Dijkstra–Voronoi Operator

For seed set $P \subset S$:

$$
\operatorname{Vor}_P(v) = \arg\min_{s \in P} d_w(s,v)
$$

where $d_w(s,v)$ is the shortest-path distance using terrain cost $w(u)$.
Ties resolved lexicographically by seed labels.

Computed by multi-source Dijkstra (priority queue).

### 2.2 Algorithm Steps (Symbolic)

1. **Step D**: $\forall v \in V: o_1(v) = \operatorname{Vor}_S(v)$
2. **Step E**: $\forall v \in V: o_2(v) = \operatorname{Vor}_{S_{sq}}(v)$
3. **Parent Map**:

   * For $s \in S_{rd}$: $p(s) = o_2(s) \in S_{sq}$
4. **Realm Ownership**:

$$
r(v) = \begin{cases}
p(o_1(v)), & \text{if } o_1(v) \in S_{rd}\\[6pt]
o_1(v), & \text{if } o_1(v) \in S_{sq}
\end{cases}
$$

5. **Sub-realm Ownership**:

   * For each realm seed $q \in S_{sq}$, let $V_q = \{v \in V \mid r(v) = q\}$.
   * Voronoi restricted to $V_q$:

$$
\forall v \in V_q: s(v) = \operatorname{Vor}^{V_q}_{\{s \in S_{rd}\mid p(s)=q\}}(v)
$$

* Unseeded cells set as wilds: $s(v) = -1$.

6. **Outputs**:

   * Realm grid $r: V \to S_{sq}$
   * Sub-realm grid $s: V \to (S_{rd} \cup \{-1\})$

### 2.3 Complexity

* Each Dijkstra pass: $O(|V| \log |V|)$ with binary heap.
* Overall: $O(|V| \log |V|)$, proportional to number of realms.
* Memory: $O(|V|)$.

---

## 3. Key Constants (Defaults)

| Glyph   | Meaning      | Cost |
| ------- | ------------ | ---- |
| `␠`     | open plain   | 1    |
| `.`     | road         | 1    |
| `,` `;` | grass/scrub  | 2    |
| `#` `&` | forest/marsh | 8    |
| `%`     | swamp        | 12   |
| `^`     | mountain     | 100  |
| `-`     | river        | 10   |
| `+`     | bridge/ford  | 1    |
| `=`     | ocean/sea    | 50   |

---

## 4. Algorithm Advantages

* **Terrain-aware**: Accurate traversal cost.
* **Hierarchical**: Clean, non-overlapping borders.
* **Label-safe Water Mask**: Preserves mask consistency.
* **Deterministic**: Stable results for repeated runs and version control.

