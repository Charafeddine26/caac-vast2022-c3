# Unified Report Q1+Q2+Q3 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rewrite `rapport-projet-VAST2022-MC3.md` from a Q1-only report into a unified multi-question report covering Q1, Q2, and Q3 of the VAST Challenge 2022 Mini-Challenge 3.

**Architecture:** The report follows Munzner's 4-level nested model. Sections 2–4 gain per-question subsections (Q1/Q2/Q3). Section 5 (architecture) is expanded to cover all 7 Redux slices, 9 D3 classes, 3 preprocessing pipelines, and the tab navigation system. The existing Q1 prose moves into subsections with minimal rewrites; new Q2/Q3 prose matches the same French academic register and course vocabulary.

**Tech Stack:** Markdown → pandoc → .docx. French academic register. Course references: Munzner 2014, Ghoniem & Médoc 2026 (Introduction, Multidimensionnelles), Médoc Tuto1–7.

**Source of truth:**
- Design doc: `docs/plans/2026-03-13-unified-report-q1q2q3-design.md`
- Report plan: `.internal/report-plan.md`
- Current report: `rapport-projet-VAST2022-MC3.md` (462 lines, Q1-only)

---

## Task 1: Restructure the skeleton — new headings and page header

**Files:**
- Modify: `rapport-projet-VAST2022-MC3.md`

**Step 1: Update the page header and title**

Replace the current title block (lines 1–9) with:

```markdown
# Rapport de projet — Tableau de bord interactif VAST Challenge 2022

**VAST Challenge 2022 — Mini-challenge Économique (Q1, Q2, Q3)**

*Cours : Visualisation de données*
*M2 IHM, 2026*

Charaf Eddine Benerrazam, Aurélien Mathis, Lynn Carla Maniboda Ngouanat, Adrian Maraj

---
```

**Step 2: Insert the new section heading structure**

The new outline (from the design doc) is:

```
1. Introduction
2. Analyse du domaine (Munzner N1)
   2.1 Contexte général
   2.2 Q1 — Prospérité des employeurs
   2.3 Q2 — Santé financière des résidents
   2.4 Q3 — Dynamique d'emploi et turnover
3. Abstraction des données et des tâches (Munzner N2)
   3.1 Q1 — données et tâches
   3.2 Q2 — données et tâches
   3.3 Q3 — données et tâches
4. Encodage visuel et interaction (Munzner N3)
   4.1 Q1 — 3 panneaux
   4.2 Q2 — 3 panneaux
   4.3 Q3 — 3 panneaux
   4.4 Vues coordonnées et interaction
5. Architecture technique (Munzner N4)
   5.1 Architecture client-serveur
   5.2 Patron MVC avec Redux
   5.3 Cycle de vie des composants
   5.4 Séparation update / updateHighlighting
   5.5 Méthodes du contrôleur
   5.6 Navigation par onglets
   5.7 Pipelines de prétraitement
6. Guide d'utilisation
7. Conclusion
8. Références
```

Move existing Q1 content into the appropriate subsections (2.2, 3.1, 4.1). Leave Q2/Q3 subsections as `<!-- TODO -->` placeholders. Keep the existing prose intact — just re-nest it under the new headings.

**Step 3: Verify the skeleton compiles**

```bash
# Quick check — no broken markdown
head -100 rapport-projet-VAST2022-MC3.md
```

**Step 4: Commit**

```bash
git add rapport-projet-VAST2022-MC3.md
git commit -m "refactor(report): restructure skeleton for unified Q1+Q2+Q3 report"
```

---

## Task 2: Rewrite Section 1 — Introduction

**Files:**
- Modify: `rapport-projet-VAST2022-MC3.md` (Section 1)

**Step 1: Write the new introduction**

The introduction must now cover all three questions. Key changes:
- Open with the VAST Challenge 2022 MC3 context (same as before)
- Quote all three questions (Q1, Q2, Q3) from the challenge
- Mention the tabbed React application with three dashboards
- Keep the Munzner framework preview paragraph
- Keep the Shneiderman mantra reference
- Keep the reference to VD_devoir_de_design.pdf

Structure:
1. Paragraph 1: VAST 2022 MC3, Engagement OH, 1011 residents, 15 months, municipal app
2. Paragraph 2: Three questions — Q1 (employer prosperity), Q2 (resident financial health), Q3 (employment dynamics/turnover). Quote each.
3. Paragraph 3: Our approach — Munzner's 4-level nested model, shared architecture, per-question analysis
4. Paragraph 4: Dashboard overview — tabbed application, 3 dashboards × 3 coordinated views each, Shneiderman mantra
5. Paragraph 5: Relationship to prior design report (VD_devoir_de_design.pdf)

**Register:** French academic, same as existing Q1 intro. Use vocabulary from `.internal/report-plan.md` section 4.

**Step 2: Verify flow by reading section 1 → section 2 transition**

**Step 3: Commit**

```bash
git add rapport-projet-VAST2022-MC3.md
git commit -m "feat(report): rewrite introduction for unified Q1+Q2+Q3 scope"
```

---

## Task 3: Write Section 2 — Analyse du domaine (Munzner N1)

**Files:**
- Modify: `rapport-projet-VAST2022-MC3.md` (Section 2)

**Step 1: Write subsection 2.1 — Contexte général**

Extract the shared context from the existing Section 2 into a general subsection:
- VAST Challenge 2022 simulation, Engagement OH
- Municipal app, 1011 residents, 15 months
- Three analytical questions posed by the challenge
- Target users: municipal decision-makers
- Munzner level 1 framing: characterize domain problem, identify users, questions, decisions

**Step 2: Refactor existing Q1 domain content into 2.2**

Move the existing Q1-specific paragraphs (prosperity/difficulty definitions, 4 analytical objectives, non-adoption threat) into subsection 2.2. Minimal rewrites — just adjust transitions so it reads as a subsection, not a standalone section.

**Step 3: Write subsection 2.3 — Q2 domain analysis**

Source: design doc Q2 section + `preprocess_q2.py` + Q2InteractionSlice.js

Content:
- **Question Q2**: *How do residents' incomes, expenses, and savings evolve over 15 months?*
- **Users/decisions**: Same municipal decision-makers, now examining resident financial well-being to understand quality of life
- **Analytical objectives**:
  1. Observer l'évolution des revenus et dépenses des résidents
  2. Comparer les profils financiers entre résidents
  3. Identifier des clusters de résidents (improving, stable, declining)
  4. Détecter les résidents en situation extrême (outliers)

**Step 4: Write subsection 2.4 — Q3 domain analysis**

Source: design doc Q3 section + `preprocess_q3.py` + Q3InteractionSlice.js

Content:
- **Question Q3**: *Which employers have high turnover, which retain employees, and what characterizes each group?*
- **Users/decisions**: Same decision-makers, examining employment stability for workforce policy
- **Analytical objectives**:
  1. Analyser les patterns de turnover au fil du temps
  2. Comparer la stabilité des employeurs entre eux
  3. Identifier les employeurs à fort/faible turnover
  4. Corréler le turnover avec la taille et la rémunération

**Step 5: Commit**

```bash
git add rapport-projet-VAST2022-MC3.md
git commit -m "feat(report): write section 2 — domain analysis for Q1/Q2/Q3"
```

---

## Task 4: Write Section 3 — Abstraction des données et des tâches (Munzner N2)

**Files:**
- Modify: `rapport-projet-VAST2022-MC3.md` (Section 3)

**Step 1: Refactor existing Q1 data/tasks into subsection 3.1**

Move the existing subsections 3.1–3.5 (tables, attributes, derived attributes, tasks, data operations) under a new `### 3.1. Q1 — données et tâches` heading. Preserve all tables and prose. Add a brief introductory sentence framing it as the Q1 abstraction.

**Step 2: Write subsection 3.2 — Q2 data and tasks**

Source: design doc, `preprocess_q2.py`, `Q2DataSlice.js`

Content structure (mirror Q1):

**3.2.1. Tables et sources**
| Source | Fichier(s) | Lignes | Rôle |
|--------|-----------|--------|------|
| FinancialJournal | `FinancialJournal.csv` | 1 856 330 | Table de faits : transactions (Wage, Food, Shelter, Recreation, Education, RentAdjustment) |
| Participants | `Attributes/Participants.csv` | 1 011 | Table de dimension : démographie (age, householdSize, haveKids, educationLevel, joviality) |

**3.2.2. Attributs dérivés**
| Attribut dérivé | Calcul | Signification |
|-----------------|--------|---------------|
| Revenu mensuel (income) | `SUM(amount)` WHERE category='Wage' par participantId/mois | Capacité de gain du résident |
| Dépenses mensuelles | `SUM(ABS(amount))` par catégorie (Food, Shelter, Recreation, Education) | Charges totales |
| Solde net mensuel (net_balance) | income − total_expenses | Épargne ou déficit |
| Pente du revenu (income_slope) | Régression linéaire sur 15 mois | Tendance de gain |
| Pente du solde net (net_balance_slope) | Régression linéaire sur 15 mois | Tendance d'épargne |
| Cluster | KMeans sur [avg_income, income_slope, avg_net_balance, net_balance_slope] | Profil financier (Improving/Stable/Declining) |

Note: mention sklearn KMeans with elbow method for k selection, StandardScaler for normalization. Reference: `preprocess_q2.py`.

**3.2.3. Tâches abstraites**
| Tâche | Action → Cible (Munzner) | Description |
|-------|--------------------------|-------------|
| Analyser les tendances revenus/dépenses | *Summarize* → *Trends* | Observer l'évolution comparée des revenus et des quatre postes de dépenses |
| Comparer les profils financiers | *Compare* → *Distribution* | Juxtaposer les distributions de solde net par mois |
| Identifier les clusters de résidents | *Discover* → *Clusters* | Faire émerger des groupes de résidents aux trajectoires similaires |
| Détecter les outliers | *Discover* → *Outliers* | Repérer les résidents aux comportements extrêmes |

**Step 3: Write subsection 3.3 — Q3 data and tasks**

Source: design doc, `preprocess_q3.py`, `Q3DataSlice.js`

**3.3.1. Tables et sources**
| Source | Fichier(s) | Lignes | Rôle |
|--------|-----------|--------|------|
| Activity Logs | `ParticipantStatusLogs{1..72}.csv` | 113 923 735 | Table de faits : affectation participant→jobId à chaque pas de 5 min |
| Jobs | `Attributes/Jobs.csv` | 1 328 | Table de dimension : jobId → employerId, hourlyRate |

**3.3.2. Attributs dérivés**
| Attribut dérivé | Calcul | Signification |
|-----------------|--------|---------------|
| Affectation mensuelle | `LAST(jobId)` par participant/mois → jointure Jobs → employerId | Employeur principal du résident pour un mois donné |
| Détection d'arrivée | Premier mois OU changement d'employeur | Nouveau salarié chez l'employeur |
| Détection de départ | Dernier mois OU changement d'employeur au mois suivant | Perte d'un salarié |
| Taux de turnover mensuel | (arrivées + départs) / (2 × effectif) | Instabilité de l'employeur |
| Ancienneté (tenure) | Mois consécutifs chez le même employeur | Fidélité des employés |
| Résumé employeur | avg_headcount, avg_turnover, total_arrivals, total_departures, avg_tenure, avg_hourly_rate | Profil synthétique |

**3.3.3. Tâches abstraites**
| Tâche | Action → Cible (Munzner) | Description |
|-------|--------------------------|-------------|
| Analyser les patterns de turnover | *Summarize* → *Trends* | Observer l'évolution du taux de turnover mois par mois |
| Comparer la stabilité des employeurs | *Compare* → *Trends* | Juxtaposer les trajectoires de turnover entre employeurs |
| Identifier les employeurs à fort/faible turnover | *Discover* → *Outliers* | Repérer les employeurs aux extrêmes |
| Corréler turnover et taille/rémunération | *Identify* → *Correlation* | Vérifier si les gros employeurs ou les mieux-payants ont moins de turnover |

**Step 4: Commit**

```bash
git add rapport-projet-VAST2022-MC3.md
git commit -m "feat(report): write section 3 — data/task abstraction for Q1/Q2/Q3"
```

---

## Task 5: Write Section 4.1 — Q1 Visual Encoding (refactor existing)

**Files:**
- Modify: `rapport-projet-VAST2022-MC3.md` (Section 4)

**Step 1: Add section 4 intro paragraph**

Write a brief introduction to section 4 covering:
- Munzner level 3: marks, channels, expressiveness, effectiveness
- Course references: Ghoniem & Médoc, *Introduction*, p. 34 (channel hierarchy), p. 18 (pre-attentive perception)
- Each question produces 3 coordinated views → 9 panels total across the application

**Step 2: Move existing panels A/B/C into subsection 4.1**

Move the existing encoding tables and prose (panels A, B, C) under `### 4.1. Q1 — Prospérité des employeurs`. Preserve all content. Add a one-line intro: "Le tableau de bord Q1 se compose de trois vues coordonnées répondant aux tâches identifiées en section 3.1."

**Step 3: Commit**

```bash
git add rapport-projet-VAST2022-MC3.md
git commit -m "refactor(report): move Q1 encoding into subsection 4.1"
```

---

## Task 6: Write Section 4.2 — Q2 Visual Encoding

**Files:**
- Modify: `rapport-projet-VAST2022-MC3.md` (Section 4.2)

**Step 1: Write Panel D — Stacked area chart (dépenses empilées + revenu)**

Source: `AreaChartD3.js`, design doc

This panel responds to *Summarize → Trends* and *Compare → Distribution*.

| Variable de données | Type (Munzner) | Marque / Canal visuel | Justification |
|---------------------|---------------|----------------------|---------------|
| Mois | Quantitatif ordonné | Position X | Canal le plus précis pour les données ordonnées (*Introduction*, p. 34) |
| Montant des dépenses | Quantitatif continu | Position Y (empilé) | Aires empilées : chaque catégorie forme une couche |
| Catégorie de dépense (Shelter, Food, Recreation, Education) | Catégoriel nominal | Teinte (palette warm: #bf360c → #ffb74d) | Canal le plus efficace pour le nominal (*Introduction*, p. 53) |
| Revenu mensuel | Quantitatif continu | Ligne superposée (bleu #1565c0) | Séparation visuelle revenus/dépenses par la forme de la marque (ligne vs aire) |

**Mark:** area (stacked) + line overlay. Technique axiale enseignée dans le cours (*Multidimensionnelles*).

Focus+context: when a cluster is selected, the area chart shows that cluster's medians with dashed reference lines for all-residents medians — exactly the focus+context technique.

**Step 2: Write Panel E — Box plot (distribution du solde net)**

Source: `BoxPlotD3.js`, design doc

This panel responds to *Compare → Distribution* and *Discover → Outliers*.

| Variable de données | Type (Munzner) | Marque / Canal visuel | Justification |
|---------------------|---------------|----------------------|---------------|
| Mois | Catégoriel ordonné | Position X (bande) | Axe temporel discrétisé par mois |
| Solde net mensuel | Quantitatif continu | Position Y (boîte à moustaches) | Q1/médiane/Q3/moustaches : résumé en 5 chiffres de la distribution |
| Valeurs extrêmes | Quantitatif continu | Points individuels | Outliers au-delà des moustaches |
| Cluster du résident (lors du highlighting) | Catégoriel nominal | Teinte | Identification du profil du résident survolé |

**Mark:** composite box-whisker (rectangle + line + point). Individual resident trajectory overlaid when hovered — *details-on-demand*.

**Step 3: Write Panel F — Resident scatter plot (pentes croisées)**

Source: `ResidentScatterD3.js`, design doc

This panel responds to *Discover → Clusters* and *Identify → Correlation*.

| Variable de données | Type (Munzner) | Marque / Canal visuel | Justification |
|---------------------|---------------|----------------------|---------------|
| Pente du revenu (income_slope) | Quantitatif divergent | Position X | Dimension clé → canal le plus précis |
| Pente du solde net (net_balance_slope) | Quantitatif divergent | Position Y | Deuxième canal positionnel |
| Revenu moyen (avg_income) | Quantitatif continu | Taille du cercle (`scaleSqrt`) | Troisième canal ; `scaleSqrt` pour perception proportionnelle des aires |
| Cluster | Catégoriel ordinal | Teinte (palette catégorielle) | Perception pré-attentive pour la segmentation (*Introduction*, p. 18) |

**Mark:** point (dot mark). 4 quadrant labels (Improving, Declining, Cutting costs, Cost of living rising) matérialisent l'interprétation sémantique de l'espace.

Technique: scatterplot pour données multidimensionnelles (*Multidimensionnelles*), même approche que le panneau C de Q1 et que le tutoriel Tuto5 (Médoc, 2026).

**Step 4: Commit**

```bash
git add rapport-projet-VAST2022-MC3.md
git commit -m "feat(report): write section 4.2 — Q2 visual encoding (3 panels)"
```

---

## Task 7: Write Section 4.3 — Q3 Visual Encoding

**Files:**
- Modify: `rapport-projet-VAST2022-MC3.md` (Section 4.3)

**Step 1: Write Panel G — Heatmap (turnover × mois)**

Source: `HeatmapD3.js`, design doc

This panel responds to *Summarize → Trends* and *Compare → Trends*.

| Variable de données | Type (Munzner) | Marque / Canal visuel | Justification |
|---------------------|---------------|----------------------|---------------|
| Mois | Catégoriel ordonné | Position X (bande) | Axe temporel discrétisé |
| Employeur | Catégoriel nominal | Position Y (bande) | Chaque ligne = un employeur |
| Taux de turnover | Quantitatif continu | Saturation de couleur (palette séquentielle OrRd) | Encodage en matrice : technique basée sur les tableaux (*Multidimensionnelles*), cf. Tuto2 double encodage |

**Mark:** rectangle (cell). Top N + bottom N employers separated by dashed line. Color legend gradient.

Course concept: *technique basée sur les tableaux* for multidimensional data (Ghoniem & Médoc, 2026, *Multidimensionnelles*). Related to adjacency matrix technique from Tuto4 (Médoc, 2026) — same cell-based encoding principle, but here the axes are employer × time rather than node × node.

**Step 2: Write Panel H — Turnover bar chart (classement horizontal)**

Source: `TurnoverBarD3.js`, design doc

This panel responds to *Discover → Outliers* and *Compare → Trends*.

| Variable de données | Type (Munzner) | Marque / Canal visuel | Justification |
|---------------------|---------------|----------------------|---------------|
| Taux de turnover moyen | Quantitatif continu | Longueur de la barre (position X) | Position = canal le plus précis |
| Employeur | Catégoriel nominal | Position Y (trié par turnover) | Classement visuel : fort turnover en haut |
| Catégorie (top N / bottom N) | Catégoriel binaire | Teinte (rouge #d62728 / vert #2ca02c) | Cohérence chromatique avec Q1 |

**Mark:** rectangle (bar mark). Median reference line (dashed). Same pattern as Q1 Panel B — horizontal bars ranked by key metric.

**Step 3: Write Panel I — Turnover scatter plot (multi-encodé)**

Source: `TurnoverScatterD3.js`, design doc

This panel responds to *Identify → Correlation* and *Discover → Outliers*.

| Variable de données | Type (Munzner) | Marque / Canal visuel | Justification |
|---------------------|---------------|----------------------|---------------|
| Effectif moyen (avg_headcount) | Quantitatif continu | Position X | Canal le plus précis |
| Taux de turnover moyen (avg_turnover) | Quantitatif continu | Position Y | Deuxième canal positionnel |
| Total des départs (total_departures) | Quantitatif continu | Taille du cercle (`scaleSqrt`) | Troisième canal ; perception proportionnelle des aires |
| Taux horaire moyen (avg_hourly_rate) | Quantitatif continu | Couleur (palette séquentielle RdYlGn) | Double encodage : taux horaire élevé en vert, faible en rouge |

**Mark:** point (dot mark). 4 attributs encodés simultanément. Dual legends (color gradient + size circles).

Same technique as Q1 Panel C and Tuto5 scatterplot (Médoc, 2026) — scatterplot multi-encodé pour données multidimensionnelles.

**Step 4: Commit**

```bash
git add rapport-projet-VAST2022-MC3.md
git commit -m "feat(report): write section 4.3 — Q3 visual encoding (3 panels)"
```

---

## Task 8: Write Section 4.4 — Coordinated views and interaction (unified)

**Files:**
- Modify: `rapport-projet-VAST2022-MC3.md` (Section 4.4)

**Step 1: Rewrite the coordinated views subsection**

This replaces the existing Section 4.4. It now covers coordination across all 3 dashboards:

Content:
1. **Principle**: Each dashboard (Q1, Q2, Q3) is a system of 3 coordinated multiple views (*vues coordonnées multiples*), as taught in *Multidimensionnelles* and implemented in Tuto5/Tuto6.

2. **Q1 coordination**: `hoveredEmployerId` + `selectedEmployerIds` (existing text, lightly edited)

3. **Q2 coordination**: `hoveredResidentId`, `hoveredMonth`, `selectedResidentIds`, `selectedCluster`
   - Cluster selection filters area chart and box plot to show cluster-specific medians
   - Individual resident highlighting overlays trajectory on box plot
   - Focus+context technique: selected cluster in foreground, all-residents medians as dashed references

4. **Q3 coordination**: `hoveredEmployerId`, `selectedEmployerIds`, `topN`
   - Same brushing+linking as Q1 across heatmap, bar chart, scatter plot
   - topN control filters heatmap and bar chart to show top/bottom N employers

5. **Shneiderman mantra** applied across all 3 dashboards (generalize existing text)
   - Overview: all panels display data simultaneously
   - Zoom/filter: topN control (Q1, Q3), cluster selection (Q2)
   - Details-on-demand: tooltips in all dashboards

**Step 2: Commit**

```bash
git add rapport-projet-VAST2022-MC3.md
git commit -m "feat(report): write section 4.4 — unified coordinated views"
```

---

## Task 9: Expand Section 5 — Architecture technique (Munzner N4)

**Files:**
- Modify: `rapport-projet-VAST2022-MC3.md` (Section 5)

**Step 1: Update subsection 5.1 — Architecture client-serveur**

Expand to mention 3 API endpoints:
- `/api/data` — Q1 data (monthly.json + employers.json)
- `/api/q2/data` — Q2 data (residents_monthly.json + residents_summary.json + cluster_meta.json)
- `/api/q3/data` — Q3 data (turnover_monthly.json + employers_turnover.json)

Source: `server/app.py`

**Step 2: Expand subsection 5.2 — MVC table**

Replace the existing MVC table with an expanded version covering all 7 slices and 9 D3 classes:

| Rôle MVC | Fichier(s) | Patron tutoriel |
|----------|-----------|-----------------|
| **Modèle** (données Q1) | `store/DataSetSlice.js` | `DataSetSlice.js` (Tuto5) |
| **Modèle** (données Q2) | `store/Q2DataSlice.js` — monthly + residents + clusters | `DataSetSlice.js` (Tuto5) |
| **Modèle** (données Q3) | `store/Q3DataSlice.js` — monthly + employers turnover | `DataSetSlice.js` (Tuto5) |
| **Modèle** (interaction Q1) | `store/InteractionSlice.js` — hoveredEmployerId, selectedEmployerIds, topN | `ItemInteractionSlice.js` (Tuto6) |
| **Modèle** (interaction Q2) | `store/Q2InteractionSlice.js` — hoveredResidentId, hoveredMonth, selectedResidentIds, selectedCluster | `ItemInteractionSlice.js` (Tuto6) |
| **Modèle** (interaction Q3) | `store/Q3InteractionSlice.js` — hoveredEmployerId, selectedEmployerIds, topN | `InteractionSlice.js` (Q1) |
| **Modèle** (navigation) | `store/NavigationSlice.js` — activeTab | Original |
| **Contrôleur** (Q1) | `TimeSeriesContainer.jsx`, `BarChartContainer.jsx`, `ScatterplotContainer.jsx` | `ScatterplotContainer.js` (Tuto5) |
| **Contrôleur** (Q2) | `AreaChartContainer.jsx`, `BoxPlotContainer.jsx`, `ResidentScatterContainer.jsx` | `ScatterplotContainer.js` (Tuto5) |
| **Contrôleur** (Q3) | `HeatmapContainer.jsx`, `TurnoverBarContainer.jsx`, `TurnoverScatterContainer.jsx` | `ScatterplotContainer.js` (Tuto5) |
| **Vue** (Q1) | `TimeSeriesD3.js`, `BarChartD3.js`, `ScatterplotD3.js` | `Matrix-d3.js` (Tuto4), `Scatterplot-d3.js` (Tuto5) |
| **Vue** (Q2) | `AreaChartD3.js`, `BoxPlotD3.js`, `ResidentScatterD3.js` | Même patron Tuto4/5 |
| **Vue** (Q3) | `HeatmapD3.js`, `TurnoverBarD3.js`, `TurnoverScatterD3.js` | Même patron Tuto4/5 |

**Step 3: Keep subsections 5.3–5.5 mostly intact**

The existing create/update/clear lifecycle, updateHighlighting separation, and controllerMethods descriptions apply to all 9 D3 classes. Add a sentence noting that these patterns are replicated identically across the 9 classes for Q1, Q2, and Q3.

For section 5.5 (controllerMethods), add a second code snippet showing Q2's variant:
```javascript
// Q2 — controllerMethods (même patron, cibles différentes)
const controllerMethods = {
  handleHover:        (residentId) => dispatch(setHoveredResident(residentId)),
  handleUnhover:      ()           => dispatch(setHoveredResident(null)),
  handleClick:        (residentId) => dispatch(toggleSelectedResident(residentId)),
  handleClusterClick: (cluster)    => dispatch(setSelectedCluster(cluster)),
};
```

**Step 4: Write new subsection 5.6 — Navigation par onglets**

Content:
- `TabBar.jsx`: 3 buttons (Q1/Q2/Q3), dispatches `setActiveTab`
- `NavigationSlice.js`: single state `activeTab` (default "q1")
- `App.jsx`: conditional rendering `{activeTab === "q1" && <Q1Dashboard />}` etc.
- Lazy loading: each dashboard dispatches its data fetch only when its tab is activated
- This pattern is original (no direct tutorial equivalent) but follows Redux principles from Tuto5/6

**Step 5: Write new subsection 5.7 — Pipelines de prétraitement**

Expand the existing pipeline subsection (5.6 → now 5.7) to cover all 3 pipelines:

| Script | Entrée | Technique | Sortie |
|--------|--------|-----------|--------|
| `preprocess.py` | Activity Logs (113.9M lignes) + Financial Journal (1.8M lignes) + Jobs | DuckDB : jointure temporelle, agrégation, régression linéaire | `monthly.json`, `employers.json` |
| `preprocess_q2.py` | Financial Journal (1.8M lignes) + Participants (1 011 lignes) | DuckDB + sklearn KMeans (méthode du coude) + StandardScaler | `residents_monthly.json`, `residents_summary.json`, `cluster_meta.json` |
| `preprocess_q3.py` | Activity Logs (113.9M lignes) + Jobs (1 328 lignes) | DuckDB : détection arrivées/départs par décalage temporel, calcul du taux de turnover | `turnover_monthly.json`, `employers_turnover.json` |

Describe each briefly:
- Q1 pipeline: existing text (jointure temporelle, agrégation salaires, pentes)
- Q2 pipeline: monthly aggregation by category, slope computation, KMeans clustering with elbow method
- Q3 pipeline: monthly employer assignment via LAST(jobId), shift-based arrival/departure detection, turnover rate computation, tenure calculation

**Step 6: Commit**

```bash
git add rapport-projet-VAST2022-MC3.md
git commit -m "feat(report): expand section 5 — architecture for Q1/Q2/Q3"
```

---

## Task 10: Rewrite Section 6 — Guide d'utilisation

**Files:**
- Modify: `rapport-projet-VAST2022-MC3.md` (Section 6)

**Step 1: Rewrite usage guide for tabbed application**

Structure:
1. **Navigation** — The application opens with the TabBar displaying Q1/Q2/Q3. Each tab loads its dashboard and data lazily.
2. **Q1 — Prospérité des employeurs** — Keep existing usage text (overview, topN, selection, hover, quadrants) but condensed
3. **Q2 — Santé financière des résidents** — Area chart shows expense breakdown + income; box plot shows monthly net balance distribution; scatter shows resident clusters. Cluster selection filters views. Resident hover overlays trajectory.
4. **Q3 — Dynamique d'emploi et turnover** — Heatmap shows employer×month turnover; bar chart ranks employers; scatter correlates headcount/turnover/pay. topN control. Same brushing+linking.
5. **Common interactions** — Shneiderman mantra applies across all 3 dashboards

**Step 2: Commit**

```bash
git add rapport-projet-VAST2022-MC3.md
git commit -m "feat(report): rewrite section 6 — usage guide for tabbed Q1/Q2/Q3"
```

---

## Task 11: Rewrite Section 7 — Conclusion

**Files:**
- Modify: `rapport-projet-VAST2022-MC3.md` (Section 7)

**Step 1: Write new conclusion**

Structure:
1. **Synthesis**: 4 Munzner levels applied across 3 questions, 9 coordinated views, 7 Redux slices, 3 preprocessing pipelines
2. **Level-by-level recap**:
   - N1: 3 questions identified, users and decisions characterized
   - N2: 3 datasets abstracted, derived attributes computed, abstract tasks mapped
   - N3: 9 panels with justified marks/channels, 3 coordinated view systems
   - N4: MVC pattern × 9, tabbed navigation, 3 DuckDB pipelines
3. **Limits**:
   - Q1: indirect prosperity indicator (no revenue data)
   - Q2: KMeans k selection sensitive to features chosen
   - Q3: monthly granularity may miss intra-month turnover
   - Linear slopes don't capture non-linear trends
   - Graph/hierarchy course material not directly mobilized (tabular data)
4. **Perspectives**:
   - Cross-question analysis (do prosperous employers have financially healthy residents?)
   - Temporal animation (small multiples or time slider)
   - DBSCAN as alternative to KMeans for Q2 clustering
5. **AI disclaimer**: same as before, generalized to all 3 pipelines

**Step 2: Commit**

```bash
git add rapport-projet-VAST2022-MC3.md
git commit -m "feat(report): rewrite section 7 — conclusion for unified report"
```

---

## Task 12: Update Section 8 — References

**Files:**
- Modify: `rapport-projet-VAST2022-MC3.md` (Section 8)

**Step 1: Update bibliography**

Add/verify:
- Pedregosa, F. et al. (2011). *Scikit-learn: Machine Learning in Python*. JMLR 12, pp. 2825–2830. (for KMeans in Q2 preprocessing)
- Keep all existing references
- Update VAST Challenge reference to cover MC3 (not just Q1)

**Step 2: Commit**

```bash
git add rapport-projet-VAST2022-MC3.md
git commit -m "feat(report): update references for unified report"
```

---

## Task 13: Final review pass and docx regeneration

**Files:**
- Modify: `rapport-projet-VAST2022-MC3.md` (final polish)
- Generate: `rapport-projet-VAST2022-MC3.docx`

**Step 1: Full read-through for register consistency**

Check:
- All French academic register is consistent (no anglicisms except where course uses them)
- All Munzner references use consistent phrasing ("Munzner, 2014, ch. X")
- All course references use consistent phrasing ("Ghoniem & Médoc, 2026, *Introduction*, p. XX")
- All tutorial references use "Médoc, 2026, Tuto*N*"
- Vocabulary from `.internal/report-plan.md` section 4 is used throughout
- No leftover `<!-- TODO -->` placeholders

**Step 2: Verify section transitions flow naturally**

Each section should end with a forward reference to the next level. Section 2→3→4→5 should feel like a coherent narrative descent through Munzner's levels.

**Step 3: Regenerate docx**

```bash
export PATH="$PATH:/c/Users/swae2/AppData/Local/Pandoc"
pandoc rapport-projet-VAST2022-MC3.md -o rapport-projet-VAST2022-MC3.docx --table-of-contents --toc-depth=3 --metadata lang=fr-FR
```

**Step 4: Commit**

```bash
git add rapport-projet-VAST2022-MC3.md rapport-projet-VAST2022-MC3.docx
git commit -m "feat(report): finalize unified Q1+Q2+Q3 report and regenerate docx"
```

---

## Dependency Graph

```
Task 1 (skeleton) ──→ Task 2 (intro) ──→ Task 3 (domain N1) ──→ Task 4 (data/tasks N2)
                                                                         │
                                                      ┌─────────────────┤
                                                      ↓                 ↓
                                               Task 5 (Q1 N3)    Task 9 (archi N4)
                                                      ↓
                                               Task 6 (Q2 N3)
                                                      ↓
                                               Task 7 (Q3 N3)
                                                      ↓
                                               Task 8 (coord views)
                                                      │                 │
                                                      ↓                 ↓
                                               Task 10 (usage) ←───────┘
                                                      ↓
                                               Task 11 (conclusion)
                                                      ↓
                                               Task 12 (references)
                                                      ↓
                                               Task 13 (review + docx)
```

Tasks 5–8 (encoding sections) and Task 9 (architecture) are independent and can be worked in parallel. All other tasks are sequential.
