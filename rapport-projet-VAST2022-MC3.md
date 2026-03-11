# Rapport de projet — Tableau de bord de prospérité des employeurs

**VAST Challenge 2022 — Mini-challenge Économique (Q1)**

*Cours : Visualisation de données*
*M2 IHM, 2026*

Charaf Eddine Benerrazam, Aurélien Mathis, Lynn Carla Maniboda Ngouanat, Adrian Maraj

---

## 1. Introduction

Le présent rapport décrit la conception et l'implémentation d'un tableau de bord interactif
répondant à la Question 1 (Q1) du mini-challenge économique du VAST Challenge 2022 :

> *« Over the period covered by the dataset, which businesses appear to be more prosperous?
> Which appear to be struggling? Describe your rationale. »*

Le jeu de données simule la vie quotidienne d'environ 1 011 résidents de la ville fictive d'Engagement, Ohio, sur une période de 15 mois (mars 2022 – mai 2023). Ces données sont
collectées via une application municipale d'urbanisme participatif. La municipalité souhaite
exploiter ces informations pour orienter l'allocation d'une subvention de renouvellement urbain.

Nous nous concentrons exclusivement sur les 253 employeurs, qui représentent les entreprises
dans ce jeu de données. En l'absence de chiffre d'affaires directement disponible, nous
définissons deux indicateurs indirects de santé économique :

- **Prospérité** : croissance ou stabilité des effectifs accompagnée d'une masse salariale
  constante ou croissante — signe que l'entreprise génère assez de revenus pour recruter et
  rémunérer ses salariés.
- **Difficulté** : baisse du nombre d'employés ou diminution drastique des salaires versés —
  signal que l'entreprise n'a plus les moyens de soutenir son activité.

Notre approche s'inscrit dans le modèle imbriqué de Munzner (2014), qui structure la conception
d'une visualisation en quatre niveaux : caractérisation du domaine, abstraction des données et
des tâches, encodage visuel et interaction, et choix algorithmiques et d'implémentation. Le
rapport suit cette progression.

Le tableau de bord se compose de trois vues coordonnées — une série temporelle, un diagramme
en barres divergent et un nuage de points multi-encodé — synchronisées par un état partagé,
permettant à l'utilisateur de passer d'une vue d'ensemble à l'examen détaillé de chaque
employeur selon le mantra de Shneiderman (1996) : *overview first, zoom and filter, then
details-on-demand*.

Ce rapport fait suite au rapport de conception de données (Benerrazam, Mathis, Ngouanat & Maraj, 2025) soumis
en amont de l'implémentation, dont il reprend et approfondit l'analyse.

---

## 2. Analyse du domaine (Munzner — niveau 1)

Le premier niveau du modèle imbriqué de Munzner (2014) consiste à caractériser le problème de
domaine : qui sont les utilisateurs cibles, quelles décisions doivent-ils prendre, et quelles
questions se posent-ils ?

**Contexte.** Le VAST Challenge 2022 simule la ville fictive d'Engagement, Ohio, dont la
municipalité dispose de données issues d'une application d'urbanisme participatif. Ces données
couvrent les activités quotidiennes de 1 011 résidents sur 15 mois. La municipalité souhaite
allouer une subvention de renouvellement urbain aux entreprises qui en ont le plus besoin.

**Utilisateurs cibles.** Les décideurs municipaux chargés de l'allocation de cette subvention.
Ils n'ont pas d'expertise en analyse de données et ont besoin d'un outil visuel leur permettant
d'identifier rapidement quelles entreprises prospèrent et lesquelles sont en difficulté.

**Question analytique (Q1).** *Quelles entreprises semblent prospères ? Lesquelles semblent en
difficulté ?* L'utilisateur doit pouvoir répondre à cette question en explorant visuellement la
dynamique économique des 253 employeurs du jeu de données.

**Objectifs analytiques.** La question Q1 se décompose en objectifs concrets :

1. Observer l'évolution temporelle de la santé financière de chaque employeur.
2. Comparer les trajectoires des employeurs entre eux pour distinguer les performants des
   défaillants.
3. Identifier les cas extrêmes — les employeurs les plus prospères et les plus en difficulté.
4. Vérifier si les indicateurs convergent (un employeur qui gagne en effectif gagne-t-il aussi
   en masse salariale ?).

Le risque principal au niveau 1 est la menace de non-adoption à long terme (Munzner, 2014,
ch. 2) : si l'outil ne répond pas aux véritables besoins des décideurs, il ne sera pas utilisé.
Nous atténuons ce risque en ancrant chaque vue du tableau de bord dans un objectif analytique
précis, identifié ci-dessus.

---

## 3. Abstraction des données et des tâches (Munzner — niveau 2)

Le deuxième niveau du modèle imbriqué traduit le problème de domaine en termes abstraits :
quelles sont les structures de données manipulées, quels types d'attributs portent-elles, et
quelles opérations abstraites l'utilisateur doit-il effectuer ?

### 3.1. Tables et chemin de jointure

Pour répondre à Q1, nous mobilisons quatre sources de données (Benerrazam, Mathis, Ngouanat & Maraj, 2025,
sec. 1.1) :

| Source | Fichier(s) | Lignes | Rôle |
|--------|-----------|--------|------|
| Activity Logs | `ParticipantStatusLogs{1..72}.csv` | 113 923 735 | Table de faits principale : relie chaque participant à son `jobId` à chaque instant (pas de 5 min) |
| Jobs | `Attributes/Jobs.csv` | 1 328 | Table de dimension : relie chaque `jobId` à un `employerId` |
| Employers | `Attributes/Employers.csv` | 253 | Table de dimension : liste des 253 employeurs |
| Financial Journal | `FinancialJournal.csv` | 1 856 330 | Table de faits : transactions de type « Wage » (salaires versés) |

Le chemin de jointure qui relie un participant à son employeur traverse deux clés étrangères :

> **Activity Logs** (`participantId`, `jobId`) → **Jobs** (`jobId` → `employerId`) → **Employers** (`employerId`)

L'intégrité référentielle a été vérifiée : zéro clé orpheline entre ces trois tables. De même,
le Financial Journal est croisé avec Jobs via `participantId` pour associer chaque salaire au
bon employeur.

### 3.2. Attributs et types de données

La classification suit la taxonomie de Munzner (2014, ch. 2) telle que présentée dans le cours
(Ghoniem & Médoc, 2026, *Introduction*, p. 32) :

| Attribut | Type (Munzner) | Source | Volumétrie |
|----------|---------------|--------|------------|
| `timestamp` | Quantitatif ordonné (séquentiel) | Activity Logs | 15 mois, pas de 5 min (~112 775 instants distincts) |
| `participantId` | Catégoriel (identifiant) | Activity Logs | 1 011 participants distincts |
| `jobId` | Catégoriel (clé étrangère → Jobs) | Activity Logs + Jobs | 1 190 emplois distincts utilisés (sur 1 328) |
| `employerId` | Catégoriel (identifiant) | Jobs + Employers | 253 employeurs |
| `amount` | Quantitatif continu | Financial Journal | Valeur des salaires versés (catégorie « Wage ») |

### 3.3. Attributs dérivés

Les indicateurs que nous mesurons ne sont pas stockés directement ; ils résultent d'opérations
d'agrégation sur les données brutes :

| Attribut dérivé | Calcul | Signification |
|-----------------|--------|---------------|
| Effectif mensuel par employeur | `COUNT(DISTINCT participantId)` par `employerId` et par mois, via jointure `jobId` → `employerId` | Nombre d'employés actifs chez un employeur pour un mois donné |
| Masse salariale mensuelle | `SUM(amount)` des lignes « Wage » par `employerId` et par mois | Puissance financière de l'entreprise |
| Pente salariale (`wage_slope`) | Régression linéaire de la masse salariale sur les 15 mois | Direction de la tendance : positive (croissance), nulle (stabilité) ou négative (déclin) |
| Pente d'effectif (`employee_slope`) | Régression linéaire de l'effectif sur les 15 mois | Même interprétation que ci-dessus, pour le nombre d'employés |

La structure cible est une table agrégée de 253 employeurs × 15 mois = jusqu'à 3 795 lignes,
complétée par un résumé de 253 lignes contenant les pentes et les totaux par employeur.

### 3.4. Abstraction des tâches

Suivant la taxonomie des actions et des cibles de Munzner (2014, ch. 3), telle qu'enseignée
dans le cours (Ghoniem & Médoc, 2026, *Introduction*, p. 70–72), la question Q1 se traduit en
quatre tâches abstraites :

| Tâche | Action → Cible (Munzner) | Description |
|-------|--------------------------|-------------|
| Analyser les tendances | *Summarize* → *Trends* | Observer l'évolution de l'effectif et de la masse salariale sur l'axe du temps pour chaque employeur. L'utilisateur doit percevoir la direction de la pente. |
| Comparer les employeurs | *Compare* → *Trends* | Juxtaposer les trajectoires de plusieurs entreprises pour distinguer celles qui surperforment de celles qui déclinent. |
| Identifier les cas extrêmes | *Discover* → *Outliers* | Repérer les entreprises aux extrêmes : plus forte croissance (prospères) et pertes les plus brutales (en difficulté). |
| Identifier les corrélations | *Identify* → *Correlation* | Vérifier si la croissance des effectifs est confirmée par une hausse proportionnelle de la masse salariale — ou si les deux indicateurs divergent. |

### 3.5. Opérations sur les données

Pour réaliser ces tâches, le pipeline de transformation applique les opérations suivantes :

1. **Jointure** : relier chaque participant à son employeur via Activity Logs ⋈ Jobs (`jobId` → `employerId`), puis croiser avec le Financial Journal pour associer chaque salaire versé au bon employeur.
2. **Filtrage** : isoler les transactions de catégorie « Wage » dans le Financial Journal.
3. **Agrégation temporelle** : grouper par mois (`date_trunc`) et par `employerId`.
4. **Calculs d'agrégat** : `COUNT(DISTINCT participantId)` pour l'effectif, `SUM(amount)` pour la masse salariale.
5. **Calcul de pente** : régression linéaire sur les 15 mois pour déterminer la tendance de chaque indicateur.
6. **Tri et classement** : trier les employeurs par pente pour identifier les leaders et les entités à risque.

---

## 4. Encodage visuel et interaction (Munzner — niveau 3)

Le troisième niveau du modèle imbriqué concerne les choix d'encodage visuel : quelles marques
graphiques utiliser, quels canaux visuels leur associer, et comment articuler les vues entre
elles. La menace à ce niveau est le choix d'un encodage inefficace (Munzner, 2014, ch. 5) :
un canal mal choisi rend les données illisibles, même si l'abstraction est correcte.

Nos choix s'appuient sur le principe d'efficacité des canaux visuels enseigné dans le cours
(Ghoniem & Médoc, 2026, *Introduction*, p. 34) : pour les données quantitatives, la position
est le canal le plus précis, suivi de la longueur, puis de la taille ; pour les données
catégorielles, la teinte est le canal le plus efficace. La perception pré-attentive
(*Introduction*, p. 18) guide le choix des encodages redondants qui permettent une détection
rapide et parallèle des motifs visuels.

### 4.1. Panneau A — Séries temporelles de l'évolution financière

Ce panneau répond aux tâches *Summarize → Trends* et *Compare → Trends*. Il affiche
l'évolution de la masse salariale mensuelle sous forme de courbes polylignes, une par
employeur.

| Variable de données | Type (Munzner) | Marque / Canal visuel | Justification |
|---------------------|---------------|----------------------|---------------|
| Mois | Quantitatif ordonné | Position X | Canal le plus précis pour les données ordonnées (*Introduction*, p. 34) |
| Masse salariale mensuelle | Quantitatif continu | Position Y | Canal le plus précis pour les quantités financières |
| Nombre d'employés moyen | Quantitatif continu | Épaisseur de la ligne | Double encodage : renforce la perception de la taille de l'entreprise sans ajouter de dimension spatiale |
| Catégorie (top *N* / bottom *N*) | Catégoriel binaire | Teinte (vert / rouge) | Canal le plus efficace pour le nominal (*Introduction*, p. 53). Vert = croissance, rouge = déclin |
| Identité de l'employeur | Catégoriel nominal | Polyligne individuelle | Chaque ligne = un employeur, suivi dans le temps |

**Marque utilisée** : ligne (*line mark*), la marque la plus naturelle pour les séries
temporelles car elle exprime visuellement la continuité et la direction de la tendance.

Les employeurs qui ne font partie ni du top *N* ni du bottom *N* sont tracés en gris clair
(opacité réduite) pour fournir un contexte de référence sans surcharger la vue. Ce choix
s'inscrit dans la technique du *focus + context* : les lignes colorées attirent l'attention
pré-attentive tandis que le fond gris donne l'échelle.

### 4.2. Panneau B — Classement en barres horizontales divergentes

Ce panneau répond aux tâches *Discover → Outliers* et *Compare → Trends*. Il classe les
employeurs du top *N* et du bottom *N* selon leur pente salariale.

| Variable de données | Type (Munzner) | Marque / Canal visuel | Justification |
|---------------------|---------------|----------------------|---------------|
| Pente de la masse salariale | Quantitatif divergent | Longueur de la barre (position X) | Position = canal le plus précis. La barre horizontale laisse la place aux labels d'employeurs |
| Employeur | Catégoriel nominal | Position Y (trié par pente) | Classement visuel : croissance en haut, déclin en bas |
| Signe de la pente | Catégoriel binaire | Teinte (vert / rouge) | Cohérence chromatique avec le panneau A |

**Marque utilisée** : rectangle (*bar mark*), la marque la plus appropriée pour comparer des
quantités entre catégories. L'orientation horizontale est choisie pour que les labels
d'employeurs soient lisibles sans rotation de texte.

Une ligne de référence à zéro matérialise la frontière entre croissance et déclin. Les barres
qui s'étendent vers la droite (pente positive) indiquent la croissance ; celles vers la gauche
(pente négative) signalent le déclin. Cette divergence est immédiatement perceptible grâce au
double encodage longueur + teinte.

### 4.3. Panneau C — Nuage de points multi-encodé

Ce panneau répond aux tâches *Identify → Correlation* et *Discover → Outliers*. Il représente
les 253 employeurs dans un espace bidimensionnel qui croise les deux indicateurs de tendance,
suivant l'approche du scatterplot pour données multidimensionnelles enseignée dans le cours
(Ghoniem & Médoc, 2026, *Multidimensionnelles*) et mise en pratique dans le tutoriel Tuto5
(Médoc, 2026).

| Variable de données | Type (Munzner) | Marque / Canal visuel | Justification |
|---------------------|---------------|----------------------|---------------|
| Pente de tendance des effectifs | Quantitatif divergent | Position X | Dimension clé → canal le plus précis |
| Pente de la masse salariale | Quantitatif continu | Position Y | Deuxième canal positionnel |
| Masse salariale totale | Quantitatif continu | Taille du cercle (`scaleSqrt`) | Troisième canal le plus efficace (*Introduction*, p. 34). L'échelle en racine carrée assure une perception proportionnelle des aires |
| Score de performance global | Quantitatif continu | Couleur (palette séquentielle RdYlGn) | Double encodage justifié : renforce la perception pré-attentive (*Introduction*, p. 18) |

**Marque utilisée** : point (*dot mark*), la marque canonique du nuage de points. Quatre
attributs de données sont encodés simultanément (position X, position Y, taille, couleur),
exploitant la capacité du scatterplot à représenter des données multidimensionnelles.

Deux lignes de référence en pointillés matérialisent les axes à zéro, divisant l'espace en
quatre quadrants sémantiques. Le quadrant supérieur droit (pentes positives sur les deux axes)
correspond aux employeurs prospères ; le quadrant inférieur gauche (pentes négatives) signale
les entreprises en difficulté. Les quadrants mixtes révèlent des situations ambiguës — par
exemple un employeur dont la masse salariale croît mais qui perd des employés.

### 4.4. Vues coordonnées et interaction

Les trois panneaux fonctionnent comme un système de vues coordonnées multiples (*coordinated
multiple views*), concept central du cours sur les données multidimensionnelles (Ghoniem &
Médoc, 2026, *Multidimensionnelles*) et mis en œuvre dans les tutoriels Tuto5 et Tuto6
(Médoc, 2026).

La coordination repose sur un état partagé (*store* Redux) qui maintient deux variables
d'interaction :

- **`hoveredEmployerId`** : l'identifiant de l'employeur survolé par le curseur.
- **`selectedEmployerIds`** : la liste des employeurs sélectionnés par clic.

Lorsque l'utilisateur survole un employeur dans n'importe quel panneau, les trois vues
réagissent simultanément : l'élément survolé est mis en relief (opacité et épaisseur de
contour accrues) tandis que les autres éléments sont atténués. Ce mécanisme de *brushing and
linking* permet de suivre un même employeur à travers les trois représentations visuelles
complémentaires.

L'ensemble du tableau de bord suit le mantra de Shneiderman (1996) :

1. **Vue d'ensemble** (*overview*) : les trois panneaux affichent simultanément les données de
   l'ensemble des 253 employeurs (panneau C) ou des top/bottom *N* (panneaux A et B).
2. **Zoom et filtrage** (*zoom and filter*) : le contrôle `topN` dans la barre de commande
   permet de restreindre le nombre d'employeurs mis en avant dans les panneaux A et B.
3. **Détails à la demande** (*details-on-demand*) : le survol d'un employeur affiche une
   infobulle contextuelle indiquant son identifiant, son effectif moyen, sa pente salariale,
   sa pente d'effectif et sa masse salariale totale.

---

## 5. Architecture technique (Munzner — niveau 4)

Le quatrième niveau du modèle imbriqué concerne les choix algorithmiques et d'implémentation.
La menace à ce niveau est la lenteur de rendu (Munzner, 2014, ch. 14) : si l'interface ne
réagit pas en temps interactif, l'utilisateur ne peut pas explorer les données de manière
fluide.

Notre architecture suit le patron d'architecture Modèle-Vue-Contrôleur (MVC) tel qu'enseigné
dans les tutoriels du cours (Médoc, 2026, Tuto4, *D3js in React*) et étendu avec Redux
(Tuto5, *MultiDim Redux*). Ce patron assure la séparation des responsabilités entre les
composants.

### 5.1. Architecture client-serveur

L'application se décompose en deux modules :

- **Serveur** (Python + Flask) : prétraitement des 17 Go de données brutes via DuckDB
  (requêtes SQL en mémoire), puis exposition d'un unique point d'accès REST
  (`/api/data`) qui sert les deux fichiers JSON agrégés (`monthly.json` et
  `employers.json`). Ce choix est inspiré de l'architecture client-serveur des tutoriels
  Tuto6 et Tuto7 (Médoc, 2026), où un serveur Flask avec CORS fournit les données
  traitées au client React.

- **Client** (React 19 + Vite + D3.js 7.9 + Redux Toolkit) : application
  monopage qui charge les données au démarrage, les stocke dans un *store* Redux, et rend
  les trois panneaux de visualisation.

### 5.2. Patron MVC avec Redux

Le tableau ci-dessous montre la correspondance entre les rôles MVC, nos fichiers, et les
concepts des tutoriels :

| Rôle MVC | Fichier(s) | Patron tutoriel |
|----------|-----------|-----------------|
| **Modèle** (données) | `store/DataSetSlice.js` — *slice* Redux avec `createAsyncThunk` pour le chargement asynchrone et `extraReducers` pour gérer les états *pending*, *fulfilled*, *rejected* | `DataSetSlice.js` (Tuto5) |
| **Modèle** (interaction) | `store/InteractionSlice.js` — *slice* Redux avec les *reducers* `setHoveredEmployer`, `toggleSelectedEmployer`, `clearSelection`, `setTopN` | `ItemInteractionSlice.js` (Tuto6) |
| **Contrôleur** | `TimeSeriesContainer.jsx`, `BarChartContainer.jsx`, `ScatterplotContainer.jsx` — composants React qui lisent le *store* via `useSelector` et transmettent les données et les méthodes de contrôle à la vue D3 | `ScatterplotContainer.js` (Tuto5) |
| **Vue** | `TimeSeriesD3.js`, `BarChartD3.js`, `ScatterplotD3.js` — classes ES6 encapsulant tout le code D3, instanciées via `useRef` et pilotées par les *hooks* `useEffect` du contrôleur | `Matrix-d3.js` (Tuto4), `Scatterplot-d3.js` (Tuto5) |

### 5.3. Cycle de vie des composants

Chaque panneau de visualisation suit un cycle de vie en trois temps, conforme au patron
introduit dans le tutoriel Tuto4 (Médoc, 2026, *D3js in React*) :

1. **`create()`** : appelé une seule fois au montage du composant React (via le *hook*
   `useEffect` avec un tableau de dépendances vide). Crée l'élément SVG, les groupes `<g>`
   pour les axes, les données et les éléments de fond. Aucune donnée n'est bindée à ce stade.

2. **`update()`** : appelé à chaque changement de données (via un second `useEffect` qui
   observe les sélecteurs Redux). Applique le *pattern update* de D3 avec la méthode
   `.join(enter, update, exit)` : les nouveaux éléments sont créés (*enter*), les éléments
   existants sont mis à jour (*update*) avec des transitions animées, et les éléments obsolètes
   sont supprimés (*exit*).

3. **`clear()`** : appelé au démontage du composant React (via la fonction de nettoyage du
   `useEffect`). Supprime le SVG pour éviter les fuites mémoire.

Pour éviter les effets de bord (*side effects*), la référence à l'instance D3 est maintenue
via le *hook* `useRef` — la classe D3 vit en dehors du cycle de rendu de React, conformément
au principe de séparation des responsabilités enseigné dans le tutoriel Tuto4.

### 5.4. Séparation update / updateHighlighting

Nous avons introduit une optimisation non présente dans les tutoriels : chaque classe D3
expose une méthode `updateHighlighting(hoveredId, selectedIds)` distincte de `update()`. Cette
séparation des responsabilités garantit que les changements d'état d'interaction (survol, clic)
ne déclenchent pas un rebindage complet des données — seules les propriétés visuelles
(opacité, épaisseur de contour, couleur de surbrillance) sont modifiées. Cela assure une
réactivité fluide même avec 253 éléments simultanés.

### 5.5. Méthodes du contrôleur

Chaque composant conteneur définit un objet `controllerMethods` transmis à la classe D3 lors
de sa construction, suivant exactement le patron des tutoriels Tuto5 et Tuto6 (Médoc, 2026) :

```javascript
const controllerMethods = {
  handleHover:   (employerId) => dispatch(setHoveredEmployer(employerId)),
  handleUnhover: ()           => dispatch(setHoveredEmployer(null)),
  handleClick:   (employerId) => dispatch(toggleSelectedEmployer(employerId)),
};
```

La classe D3 attache ces méthodes aux événements `mouseenter`, `mouseleave` et `click` de
chaque élément SVG. Ainsi, l'interaction utilisateur remonte du DOM vers le *store* Redux via
le contrôleur, puis redescend vers les trois vues coordonnées — boucle MVC complète.

### 5.6. Pipeline de prétraitement

Le serveur exécute un pipeline SQL via DuckDB qui transforme les 113 millions de lignes
d'Activity Logs et les 1,8 million de transactions du Financial Journal en deux fichiers JSON
compacts :

1. **Jointure temporelle** : pour chaque participant et chaque mois, identifier le dernier
   `jobId` observé dans les Activity Logs, puis résoudre l'`employerId` correspondant via
   la table Jobs.
2. **Agrégation des salaires** : sommer les montants « Wage » du Financial Journal par
   `employerId` et par mois, compter les participants distincts.
3. **Calcul des pentes** : pour chaque employeur, calculer la régression linéaire de la masse
   salariale et de l'effectif sur les 15 mois.
4. **Export JSON** : `monthly.json` (séries temporelles) et `employers.json` (résumé par
   employeur avec pentes et totaux).

---

## 6. Guide d'utilisation

Le tableau de bord s'utilise selon le mantra de Shneiderman (1996) : vue d'ensemble d'abord,
zoom et filtrage ensuite, détails à la demande enfin.

**1. Vue d'ensemble.** Au chargement, les trois panneaux s'affichent simultanément. Le
panneau A (séries temporelles) montre les 10 employeurs les plus prospères en vert et les 10
plus en difficulté en rouge, sur fond de l'ensemble des 253 courbes en gris. Le panneau B
(barres divergentes) classe ces 20 employeurs par pente salariale. Le panneau C (nuage de
points) positionne les 253 employeurs dans l'espace des deux pentes.

**2. Zoom et filtrage.** La barre de contrôle en haut du tableau de bord contient un champ
numérique « Show top/bottom » qui permet d'ajuster la valeur *N*. Augmenter *N* révèle
davantage d'employeurs dans les panneaux A et B ; le réduire concentre l'attention sur les
cas les plus extrêmes.

**3. Sélection.** Un clic sur un employeur dans n'importe quel panneau le sélectionne : il
est mis en surbrillance dans les trois vues simultanément. Plusieurs employeurs peuvent être
sélectionnés successivement. Un second clic sur un employeur déjà sélectionné le
désélectionne. Le bouton « Clear selection » réinitialise la sélection.

**4. Exploration par survol.** Le passage du curseur sur un élément (ligne, barre ou point)
met en relief l'employeur correspondant dans les trois panneaux et affiche une infobulle
indiquant : l'identifiant de l'employeur, son effectif moyen, sa pente salariale, sa pente
d'effectif et sa masse salariale totale.

**5. Lecture des quadrants (panneau C).** Les lignes de référence en pointillés à zéro
divisent le nuage de points en quatre quadrants. Le quadrant supérieur droit regroupe les
employeurs dont les deux indicateurs croissent (prospères) ; le quadrant inférieur gauche
regroupe ceux dont les deux indicateurs déclinent (en difficulté). Les quadrants mixtes
signalent des situations ambiguës méritant une investigation plus fine via les panneaux A et B.

---

## 7. Conclusion

Ce rapport a présenté la conception et l'implémentation d'un tableau de bord interactif
permettant d'évaluer la prospérité des 253 employeurs du jeu de données VAST Challenge 2022.
L'approche est structurée selon les quatre niveaux du modèle imbriqué de Munzner (2014) :

- Au **niveau 1** (domaine), nous avons identifié les besoins des décideurs municipaux et
  formulé quatre objectifs analytiques découlant de la question Q1.
- Au **niveau 2** (abstraction), nous avons caractérisé les données (tables, types d'attributs,
  chemin de jointure) et traduit les objectifs en tâches abstraites selon la taxonomie de
  Munzner.
- Au **niveau 3** (encodage), nous avons conçu trois vues coordonnées — série temporelle,
  barres divergentes et nuage de points — dont chaque canal visuel est justifié par le
  principe d'efficacité des canaux enseigné dans le cours.
- Au **niveau 4** (implémentation), nous avons réalisé le tableau de bord en suivant le patron
  MVC avec séparation des responsabilités (classe D3 encapsulée + conteneur React + *store*
  Redux), conformément à l'architecture des tutoriels du cours.

**Limites.** Notre approche repose sur un indicateur indirect de prospérité — effectif et
masse salariale — en l'absence de chiffre d'affaires dans le jeu de données. La pente
linéaire utilisée comme mesure de tendance ne capte pas les ruptures brutales ni les variations
saisonnières. Enfin, le jeu de données étant tabulaire, les cours sur la visualisation de
graphes et de données hiérarchiques n'ont pas été directement mobilisés.

**Perspectives.** Le tableau de bord pourrait être enrichi par un regroupement automatique des
employeurs par clustering (*k*-means ou DBSCAN) pour faire émerger des profils de prospérité.
Une animation temporelle (*small multiples* ou curseur de temps) permettrait d'observer les
transitions mois par mois. L'ajout de données de fréquentation (CheckinJournal) pourrait
élargir la définition de prospérité aux commerces de détail (restaurants, pubs).

**Note.** Certaines métriques techniques et statistiques de volumétrie ont été extraites et
vérifiées à l'aide d'une intelligence artificielle, notamment le décompte précis des lignes
des jeux de données, le nombre exact d'identifiants uniques ainsi que la validation des calculs
d'agrégation pour la structure cible.

---

## 8. Références

- Munzner, T. (2014). *Visualization Analysis and Design*. A K Peters Visualization Series, CRC Press.
- Shneiderman, B. (1996). « The Eyes Have It: A Task by Data Type Taxonomy for Information Visualizations ». *Proceedings of the IEEE Symposium on Visual Languages*, pp. 336–343.
- Ghoniem, M. & Médoc, N. (2026). *Introduction à la visualisation d'information* [support de cours]. M2 IHM.
- Ghoniem, M. & Médoc, N. (2026). *Visualisation de données multidimensionnelles* [support de cours]. M2 IHM.
- Médoc, N. (2026). Tutoriels Tuto1–Tuto7 [dépôts GitHub]. https://github.com/nicolasmedoc
- VAST Challenge 2022, Mini-Challenge 3 — Economic Q1. https://vast-challenge.github.io/2022/
- Benerrazam, C. E., Mathis, A., Maniboda Ngouanat, L. C. & Maraj, A. (2025). *Rapport de conception de données — VAST Challenge 2022, Mini-challenge Économique (Q1)*.
