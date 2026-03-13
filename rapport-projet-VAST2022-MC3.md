# Rapport de projet — Tableau de bord interactif VAST Challenge 2022

**VAST Challenge 2022 — Mini-challenge Économique (Q1, Q2, Q3)**

*Cours : Visualisation de données*
*M2 IHM, 2026*

Charaf Eddine Benerrazam, Aurélien Mathis, Lynn Carla Maniboda Ngouanat, Adrian Maraj

---

## 1. Introduction

Le présent rapport décrit la conception et l'implémentation d'un tableau de bord interactif
répondant aux trois questions économiques (Q1, Q2, Q3) du mini-challenge 3 du VAST
Challenge 2022. Le jeu de données simule la vie quotidienne de 1 011 résidents de la ville
fictive d'Engagement, Ohio, sur une période de 15 mois (mars 2022 – mai 2023). Ces données
sont collectées via une application municipale d'urbanisme participatif et couvrent les
activités, les transactions financières et les affectations professionnelles de chaque résident.

Les trois questions posées par le challenge sont les suivantes :

- **Q1 — Prospérité des employeurs.** *« Over the period covered by the dataset, which
  businesses appear to be more prosperous? Which appear to be struggling? Describe your
  rationale. »* — Identifier les entreprises qui prospèrent et celles qui déclinent, en
  l'absence de chiffre d'affaires direct.
- **Q2 — Santé financière des résidents.** *« How do residents' incomes, expenses, and savings
  evolve over the 15 months? »* — Analyser l'évolution des revenus, des dépenses et de
  l'épargne des résidents pour évaluer leur bien-être financier.
- **Q3 — Dynamique d'emploi et turnover.** *« Which employers have high staff turnover, which
  retain employees, and what characterizes each group? »* — Examiner la stabilité de l'emploi
  chez les différents employeurs et les facteurs associés au turnover.

Notre approche s'inscrit dans le modèle imbriqué de Munzner (2014), qui structure la conception
d'une visualisation en quatre niveaux : caractérisation du domaine (N1), abstraction des données
et des tâches (N2), encodage visuel et interaction (N3), et choix algorithmiques et
d'implémentation (N4). Les sections 2 à 4 déclinent chaque niveau par question, tandis que la
section 5 (architecture) est partagée car les trois tableaux de bord reposent sur la même pile
technique et le même patron de conception.

L'application prend la forme d'une interface à onglets (Q1, Q2, Q3), chaque onglet ouvrant un
tableau de bord composé de trois vues coordonnées — soit neuf panneaux au total. Chaque
système de vues est synchronisé par un *store* Redux dédié et permet à l'utilisateur de passer
d'une vue d'ensemble à l'examen détaillé selon le mantra de Shneiderman (1996) : *overview
first, zoom and filter, then details-on-demand*.

Ce rapport fait suite au rapport de conception de données (Benerrazam, Mathis, Ngouanat &
Maraj, 2025) soumis en amont de l'implémentation, dont il reprend et approfondit l'analyse.

---

## 2. Analyse du domaine (Munzner — niveau 1)

Le premier niveau du modèle imbriqué de Munzner (2014) consiste à caractériser le problème de
domaine : qui sont les utilisateurs cibles, quelles décisions doivent-ils prendre, et quelles
questions se posent-ils ? La taxonomie des tâches (Ghoniem & Médoc, 2026, *Introduction*,
p. 70–72) fournit le cadre pour décomposer chaque question en objectifs analytiques concrets.

### 2.1. Contexte général

Le VAST Challenge 2022 simule la ville fictive d'Engagement, Ohio, dont la municipalité
dispose de données issues d'une application d'urbanisme participatif. Ces données couvrent les
activités quotidiennes de 1 011 résidents sur 15 mois (mars 2022 – mai 2023) : déplacements,
affectations professionnelles, transactions financières et interactions sociales. La
municipalité souhaite exploiter ces informations pour orienter ses politiques publiques —
notamment l'allocation d'une subvention de renouvellement urbain.

**Utilisateurs cibles.** Les décideurs municipaux chargés de ces politiques. Ils n'ont pas
d'expertise en analyse de données et ont besoin d'un outil visuel leur permettant d'explorer
la dynamique économique de la ville sous trois angles complémentaires : la prospérité des
entreprises (Q1), le bien-être financier des résidents (Q2) et la stabilité de l'emploi (Q3).

**Questions analytiques.** Le mini-challenge économique pose trois questions, que nous
traitons chacune dans un tableau de bord dédié au sein d'une application à onglets. Les
sous-sections suivantes caractérisent le domaine propre à chaque question.

Le risque principal au niveau 1 est la menace de non-adoption à long terme (Munzner, 2014,
ch. 2) : si l'outil ne répond pas aux véritables besoins des décideurs, il ne sera pas utilisé.
Nous atténuons ce risque en ancrant chaque vue de chaque tableau de bord dans un objectif
analytique précis, identifié ci-dessous.

### 2.2. Q1 — Prospérité des employeurs

**Question.** *Quelles entreprises semblent prospères ? Lesquelles semblent en difficulté ?*
L'utilisateur doit pouvoir répondre à cette question en explorant visuellement la dynamique
économique des 253 employeurs du jeu de données.

En l'absence de chiffre d'affaires directement disponible, nous définissons deux indicateurs
indirects de santé économique :

- **Prospérité** : croissance ou stabilité des effectifs accompagnée d'une masse salariale
  constante ou croissante — signe que l'entreprise génère assez de revenus pour recruter et
  rémunérer ses salariés.
- **Difficulté** : baisse du nombre d'employés ou diminution drastique des salaires versés —
  signal que l'entreprise n'a plus les moyens de soutenir son activité.

**Objectifs analytiques.** La question Q1 se décompose en objectifs concrets :

1. Observer l'évolution temporelle de la santé financière de chaque employeur.
2. Comparer les trajectoires des employeurs entre eux pour distinguer les performants des
   défaillants.
3. Identifier les cas extrêmes — les employeurs les plus prospères et les plus en difficulté.
4. Vérifier si les indicateurs convergent (un employeur qui gagne en effectif gagne-t-il aussi
   en masse salariale ?).

### 2.3. Q2 — Santé financière des résidents

**Question.** *Comment évoluent les revenus, les dépenses et l'épargne des résidents au fil des
15 mois ?* Les décideurs municipaux souhaitent évaluer la qualité de vie des résidents et
identifier ceux dont la situation financière se dégrade.

Les données du Financial Journal enregistrent six catégories de transactions pour chaque
résident : salaires (*Wage*), logement (*Shelter*), alimentation (*Food*), loisirs
(*Recreation*), éducation (*Education*) et ajustements de loyer (*RentAdjustment*). La table
Participants fournit les attributs démographiques (âge, taille du ménage, enfants, niveau
d'éducation, jovialité).

**Objectifs analytiques.** La question Q2 se décompose en objectifs concrets :

1. Observer l'évolution des revenus et des dépenses des résidents au fil du temps.
2. Comparer les profils financiers entre résidents pour distinguer les trajectoires favorables
   des trajectoires défavorables.
3. Identifier des clusters de résidents aux trajectoires similaires (amélioration, stabilité,
   déclin).
4. Détecter les résidents en situation extrême — outliers dont le solde net diverge fortement
   de la tendance générale.

### 2.4. Q3 — Dynamique d'emploi et turnover

**Question.** *Quels employeurs connaissent un fort turnover, lesquels fidélisent leurs
employés, et qu'est-ce qui caractérise chaque groupe ?* Les décideurs municipaux souhaitent
examiner la stabilité de l'emploi pour orienter les politiques de soutien à l'emploi.

Les Activity Logs enregistrent l'affectation de chaque résident à un emploi (*jobId*) à chaque
pas de 5 minutes sur 15 mois. La table Jobs relie chaque emploi à un employeur et à un taux
horaire. En croisant ces deux sources, il est possible de reconstituer les flux d'arrivées et
de départs mensuels chez chaque employeur.

**Objectifs analytiques.** La question Q3 se décompose en objectifs concrets :

1. Analyser les patterns de turnover au fil du temps pour chaque employeur.
2. Comparer la stabilité des employeurs entre eux pour distinguer les fidélisateurs des
   employeurs à forte rotation.
3. Identifier les employeurs aux extrêmes — fort turnover ou très grande stabilité.
4. Corréler le turnover avec la taille de l'employeur et le niveau de rémunération.

---

## 3. Abstraction des données et des tâches (Munzner — niveau 2)

Le deuxième niveau du modèle imbriqué traduit le problème de domaine en termes abstraits :
quelles sont les structures de données manipulées, quels types d'attributs portent-elles, et
quelles opérations abstraites l'utilisateur doit-il effectuer ? La classification des attributs
suit la taxonomie de Munzner (2014, ch. 2) telle que présentée dans le cours (Ghoniem & Médoc,
2026, *Introduction*, p. 32), et les tâches sont formulées selon la taxonomie actions → cibles
(Ghoniem & Médoc, 2026, *Introduction*, p. 70–72).

### 3.1. Q1 — données et tâches

#### 3.1.1. Tables et chemin de jointure

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

#### 3.1.2. Attributs et types de données

La classification suit la taxonomie de Munzner (2014, ch. 2) telle que présentée dans le cours
(Ghoniem & Médoc, 2026, *Introduction*, p. 32) :

| Attribut | Type (Munzner) | Source | Volumétrie |
|----------|---------------|--------|------------|
| `timestamp` | Quantitatif ordonné (séquentiel) | Activity Logs | 15 mois, pas de 5 min (~112 775 instants distincts) |
| `participantId` | Catégoriel (identifiant) | Activity Logs | 1 011 participants distincts |
| `jobId` | Catégoriel (clé étrangère → Jobs) | Activity Logs + Jobs | 1 190 emplois distincts utilisés (sur 1 328) |
| `employerId` | Catégoriel (identifiant) | Jobs + Employers | 253 employeurs |
| `amount` | Quantitatif continu | Financial Journal | Valeur des salaires versés (catégorie « Wage ») |

#### 3.1.3. Attributs dérivés

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

#### 3.1.4. Abstraction des tâches

Suivant la taxonomie des actions et des cibles de Munzner (2014, ch. 3), telle qu'enseignée
dans le cours (Ghoniem & Médoc, 2026, *Introduction*, p. 70–72), la question Q1 se traduit en
quatre tâches abstraites :

| Tâche | Action → Cible (Munzner) | Description |
|-------|--------------------------|-------------|
| Analyser les tendances | *Summarize* → *Trends* | Observer l'évolution de l'effectif et de la masse salariale sur l'axe du temps pour chaque employeur. L'utilisateur doit percevoir la direction de la pente. |
| Comparer les employeurs | *Compare* → *Trends* | Juxtaposer les trajectoires de plusieurs entreprises pour distinguer celles qui surperforment de celles qui déclinent. |
| Identifier les cas extrêmes | *Discover* → *Outliers* | Repérer les entreprises aux extrêmes : plus forte croissance (prospères) et pertes les plus brutales (en difficulté). |
| Identifier les corrélations | *Identify* → *Correlation* | Vérifier si la croissance des effectifs est confirmée par une hausse proportionnelle de la masse salariale — ou si les deux indicateurs divergent. |

#### 3.1.5. Opérations sur les données

Pour réaliser ces tâches, le pipeline de transformation applique les opérations suivantes :

1. **Jointure** : relier chaque participant à son employeur via Activity Logs ⋈ Jobs (`jobId` → `employerId`), puis croiser avec le Financial Journal pour associer chaque salaire versé au bon employeur.
2. **Filtrage** : isoler les transactions de catégorie « Wage » dans le Financial Journal.
3. **Agrégation temporelle** : grouper par mois (`date_trunc`) et par `employerId`.
4. **Calculs d'agrégat** : `COUNT(DISTINCT participantId)` pour l'effectif, `SUM(amount)` pour la masse salariale.
5. **Calcul de pente** : régression linéaire sur les 15 mois pour déterminer la tendance de chaque indicateur.
6. **Tri et classement** : trier les employeurs par pente pour identifier les leaders et les entités à risque.

### 3.2. Q2 — données et tâches

#### 3.2.1. Tables et chemin de jointure

Pour répondre à Q2, nous mobilisons deux sources de données :

| Source | Fichier(s) | Lignes | Rôle |
|--------|-----------|--------|------|
| Financial Journal | `FinancialJournal.csv` | 1 856 330 | Table de faits : toutes les transactions (Wage, Shelter, Food, Recreation, Education, RentAdjustment) par résident et par date |
| Participants | `Attributes/Participants.csv` | 1 011 | Table de dimension : attributs démographiques de chaque résident |

Le chemin de jointure est direct :

> **Financial Journal** (`participantId`) → **Participants** (`participantId`)

#### 3.2.2. Attributs et types de données

| Attribut | Type (Munzner) | Source | Volumétrie |
|----------|---------------|--------|------------|
| `participantId` | Catégoriel (identifiant) | Financial Journal + Participants | 1 011 résidents |
| `timestamp` | Quantitatif ordonné | Financial Journal | 15 mois |
| `category` | Catégoriel nominal | Financial Journal | 6 catégories de transactions |
| `amount` | Quantitatif continu | Financial Journal | Montant de chaque transaction |
| `age` | Quantitatif continu | Participants | Âge du résident |
| `householdSize` | Quantitatif discret | Participants | Taille du ménage |
| `haveKids` | Catégoriel binaire | Participants | Présence d'enfants |
| `educationLevel` | Catégoriel ordinal | Participants | Niveau d'éducation |
| `joviality` | Quantitatif continu | Participants | Score de bien-être subjectif |

#### 3.2.3. Attributs dérivés

Le pipeline de prétraitement Q2 (`preprocess_q2.py`) produit trois niveaux d'agrégation :

| Attribut dérivé | Calcul | Signification |
|-----------------|--------|---------------|
| Revenu mensuel | `SUM(amount)` des lignes « Wage » par `participantId` et par mois | Salaire total perçu dans le mois |
| Dépenses mensuelles par catégorie | `SUM(amount)` des lignes Shelter, Food, Recreation, Education par résident et par mois | Ventilation des postes de dépenses |
| Solde net mensuel | Revenu − somme des dépenses | Capacité d'épargne (positif) ou déficit (négatif) |
| Pente du revenu (`income_slope`) | Régression linéaire du revenu sur les 15 mois | Tendance haussière ou baissière du salaire |
| Pente du solde net (`net_balance_slope`) | Régression linéaire du solde net sur les 15 mois | Trajectoire financière globale |
| Cluster | KMeans sur `[avg_income, income_slope, avg_net_balance, net_balance_slope]`, *k* choisi par méthode du coude | Profil financier : Improving, Stable ou Declining |

La structure cible comprend trois fichiers JSON : `residents_monthly.json` (séries temporelles
par résident), `residents_summary.json` (résumé avec pentes, moyennes et cluster) et
`cluster_meta.json` (centroïdes et tailles de clusters).

#### 3.2.4. Abstraction des tâches

Suivant la même taxonomie de Munzner (2014, ch. 3 ; Ghoniem & Médoc, 2026, *Introduction*,
p. 70–72) :

| Tâche | Action → Cible (Munzner) | Description |
|-------|--------------------------|-------------|
| Analyser les tendances revenu/dépenses | *Summarize* → *Trends* | Observer l'évolution des revenus et des dépenses au fil du temps, globalement et par cluster. |
| Comparer les profils financiers | *Compare* → *Distribution* | Juxtaposer les distributions de solde net entre mois et entre clusters pour identifier les trajectoires divergentes. |
| Identifier les clusters de résidents | *Discover* → *Clusters* | Faire émerger des groupes de résidents aux dynamiques financières similaires via le clustering KMeans. |
| Détecter les outliers | *Discover* → *Outliers* | Repérer les résidents dont le solde net s'écarte fortement de la distribution — candidats à une investigation individuelle. |

#### 3.2.5. Opérations sur les données

1. **Jointure** : relier chaque transaction du Financial Journal au profil démographique du résident via `participantId`.
2. **Filtrage et catégorisation** : séparer les transactions par catégorie (Wage, Shelter, Food, Recreation, Education).
3. **Agrégation temporelle** : grouper par mois et par `participantId`, calculer revenus, dépenses et solde net.
4. **Calcul de pente** : régression linéaire sur les 15 mois pour le revenu et le solde net de chaque résident.
5. **Clustering** : normalisation des indicateurs, méthode du coude pour choisir *k*, puis KMeans (scikit-learn) sur les pentes et moyennes.
6. **Export JSON** : trois fichiers structurés pour le chargement asynchrone côté client.

### 3.3. Q3 — données et tâches

#### 3.3.1. Tables et chemin de jointure

Pour répondre à Q3, nous mobilisons deux sources de données :

| Source | Fichier(s) | Lignes | Rôle |
|--------|-----------|--------|------|
| Activity Logs | `ParticipantStatusLogs{1..72}.csv` | 113 923 735 | Table de faits : affectation de chaque participant à un `jobId` à chaque pas de 5 min |
| Jobs | `Attributes/Jobs.csv` | 1 328 | Table de dimension : relie chaque `jobId` à un `employerId` et un `hourlyRate` |

Le chemin de jointure est le même que pour Q1 :

> **Activity Logs** (`participantId`, `jobId`) → **Jobs** (`jobId` → `employerId`)

#### 3.3.2. Attributs et types de données

| Attribut | Type (Munzner) | Source | Volumétrie |
|----------|---------------|--------|------------|
| `participantId` | Catégoriel (identifiant) | Activity Logs | 1 011 participants |
| `jobId` | Catégoriel (clé étrangère → Jobs) | Activity Logs + Jobs | 1 190 emplois utilisés |
| `employerId` | Catégoriel (identifiant) | Jobs | 253 employeurs |
| `hourlyRate` | Quantitatif continu | Jobs | Taux horaire associé à chaque emploi |
| `timestamp` | Quantitatif ordonné | Activity Logs | 15 mois, pas de 5 min |

#### 3.3.3. Attributs dérivés

Le pipeline de prétraitement Q3 (`preprocess_q3.py`) reconstitue les flux de main-d'œuvre :

| Attribut dérivé | Calcul | Signification |
|-----------------|--------|---------------|
| Affectation mensuelle | Dernier `jobId` observé par participant et par mois → `employerId` | Employeur courant de chaque résident pour un mois donné |
| Arrivée | Premier mois d'apparition chez un employeur, ou changement d'employeur | Flux entrant de main-d'œuvre |
| Départ | Dernier mois chez un employeur avant changement ou fin de données | Flux sortant de main-d'œuvre |
| Taux de turnover mensuel | (arrivées + départs) / (2 × effectif) par employeur et par mois | Mesure normalisée de la rotation du personnel |
| Ancienneté par stint | Nombre de mois consécutifs chez le même employeur | Fidélisation des employés |
| Résumé employeur | `avg_headcount`, `avg_turnover`, `total_arrivals`, `total_departures`, `avg_tenure`, `avg_hourly_rate` | Profil synthétique de chaque employeur |

La structure cible comprend deux fichiers JSON : `turnover_monthly.json` (séries temporelles
de turnover par employeur) et `employers_turnover.json` (résumé par employeur).

#### 3.3.4. Abstraction des tâches

| Tâche | Action → Cible (Munzner) | Description |
|-------|--------------------------|-------------|
| Analyser les patterns de turnover | *Summarize* → *Trends* | Observer l'évolution du taux de turnover au fil des 15 mois pour chaque employeur. |
| Comparer la stabilité des employeurs | *Compare* → *Trends* | Juxtaposer les profils de turnover entre employeurs pour distinguer les stables des instables. |
| Identifier les extrêmes | *Discover* → *Outliers* | Repérer les employeurs au turnover le plus élevé et ceux à la rétention la plus forte. |
| Corréler turnover et attributs | *Identify* → *Correlation* | Vérifier si le turnover est lié à la taille de l'employeur ou au niveau de rémunération. |

#### 3.3.5. Opérations sur les données

1. **Jointure** : résoudre l'`employerId` de chaque participant via Activity Logs ⋈ Jobs.
2. **Agrégation temporelle** : pour chaque participant et chaque mois, identifier le dernier `jobId` observé (affectation mensuelle).
3. **Détection des flux** : comparer les affectations mois à mois pour détecter les arrivées (nouvel employeur) et les départs (changement ou disparition).
4. **Calcul du turnover** : agréger arrivées et départs par employeur et par mois, normaliser par l'effectif.
5. **Calcul des résumés** : moyennes, totaux et ancienneté par employeur sur les 15 mois.
6. **Export JSON** : deux fichiers structurés pour le chargement asynchrone côté client.

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

Chaque question dispose de trois panneaux coordonnés — soit neuf panneaux au total. Les
sous-sections 4.1 à 4.3 détaillent l'encodage de chaque panneau ; la sous-section 4.4 décrit
les mécanismes de coordination et d'interaction communs aux trois tableaux de bord.

### 4.1. Q1 — Prospérité des employeurs

#### 4.1.1. Panneau A — Séries temporelles de l'évolution financière

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

#### 4.1.2. Panneau B — Classement en barres horizontales divergentes

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

#### 4.1.3. Panneau C — Nuage de points multi-encodé

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

### 4.2. Q2 — Santé financière des résidents

Le tableau de bord Q2 est composé de trois panneaux coordonnés qui permettent d'analyser la
situation financière des résidents à trois niveaux de granularité : agrégé par catégorie de
dépense (panneau D), distribué par mois (panneau E), et individuel dans l'espace des pentes
(panneau F).

#### 4.2.1. Panneau D — Diagramme à aires empilées avec ligne de revenu

Ce panneau répond aux tâches *Summarize → Trends* et *Compare → Distribution*. Il superpose
l'évolution des dépenses mensuelles (aires empilées par catégorie) et du revenu (ligne
superposée), permettant de visualiser simultanément la structure des dépenses et le différentiel
revenu/dépenses. Lorsqu'un cluster est sélectionné, le panneau affiche les médianes du cluster
avec des lignes pointillées de référence représentant les médianes de l'ensemble des résidents.

| Variable de données | Type (Munzner) | Marque / Canal visuel | Justification |
|---------------------|---------------|----------------------|---------------|
| Mois | Quantitatif ordonné | Position X | Canal le plus précis pour les données temporelles (*Introduction*, p. 34) |
| Montant des dépenses | Quantitatif continu | Position Y (empilée) | Les aires empilées montrent à la fois les parts relatives et le total |
| Catégorie de dépense (Shelter, Food, Recreation, Education) | Catégoriel nominal | Teinte (palette catégorielle) | Canal le plus efficace pour le nominal (*Introduction*, p. 53). Quatre teintes distinctes permettent l'identification pré-attentive de chaque poste |
| Revenu mensuel | Quantitatif continu | Ligne superposée (position Y) | La distinction marque ligne vs marque aire sépare visuellement revenu et dépenses sans ajouter de dimension spatiale |

**Marques utilisées** : aire (*area mark*) pour les dépenses empilées, ligne (*line mark*)
pour le revenu. Cette combinaison relève des techniques axiales pour données
multidimensionnelles (Ghoniem & Médoc, 2026, *Multidimensionnelles*).

#### 4.2.2. Panneau E — Boîte à moustaches du solde net mensuel

Ce panneau répond aux tâches *Compare → Distribution* et *Discover → Outliers*. Il affiche la
distribution du solde net (revenu − dépenses) sous forme de boîtes à moustaches mensuelles,
permettant de suivre l'évolution de la dispersion et de la position centrale au fil du temps.
Lorsqu'un résident est survolé ou sélectionné, sa trajectoire individuelle est superposée aux
boîtes.

| Variable de données | Type (Munzner) | Marque / Canal visuel | Justification |
|---------------------|---------------|----------------------|---------------|
| Mois | Quantitatif ordonné | Position X (bande) | Échelle à bandes pour juxtaposer les distributions mensuelles |
| Solde net | Quantitatif continu | Position Y | Canal le plus précis pour les quantités financières |
| Quartiles, médiane, moustaches | Quantitatif continu | Marque composite box-whisker | Représentation canonique de la distribution — Q1, médiane, Q3, moustaches et outliers |
| Cluster du résident | Catégoriel nominal | Teinte (points outliers et trajectoire) | Cohérence chromatique avec le panneau F pour le suivi inter-vues |

**Marque utilisée** : marque composite boîte-à-moustaches (*box-whisker mark*), complétée par
des points (*dot marks*) pour les outliers et les trajectoires individuelles.

#### 4.2.3. Panneau F — Nuage de points des résidents par cluster

Ce panneau répond aux tâches *Discover → Clusters* et *Discover → Outliers*. Il représente
chaque résident dans l'espace bidimensionnel des pentes (pente du revenu en X, pente du solde
net en Y), coloré par cluster et dimensionné par le revenu moyen. Quatre labels de quadrant
(Improving, Declining, Cutting costs, Cost of living rising) guident l'interprétation.

| Variable de données | Type (Munzner) | Marque / Canal visuel | Justification |
|---------------------|---------------|----------------------|---------------|
| Pente du revenu (`income_slope`) | Quantitatif divergent | Position X | Dimension clé → canal le plus précis |
| Pente du solde net (`net_balance_slope`) | Quantitatif divergent | Position Y | Deuxième canal positionnel |
| Cluster | Catégoriel nominal | Teinte (palette ordinale) | Canal le plus efficace pour le nominal (*Introduction*, p. 53). Les clusters (Improving, Stable, Declining) sont immédiatement distinguables |
| Revenu moyen (`avg_income`) | Quantitatif continu | Taille du cercle (`scaleSqrt`) | Troisième canal le plus efficace (*Introduction*, p. 34). Échelle en racine carrée pour la perception proportionnelle des aires |

**Marque utilisée** : point (*dot mark*), suivant le même patron que le panneau C (Q1). Ce
scatterplot multi-encodé est directement inspiré du tutoriel Tuto5 (Médoc, 2026) et illustre
la technique du scatterplot pour données multidimensionnelles (Ghoniem & Médoc, 2026,
*Multidimensionnelles*). Les lignes de référence à zéro divisent l'espace en quatre quadrants
sémantiques facilitant la lecture des trajectoires financières.

### 4.3. Q3 — Dynamique d'emploi et turnover

Le tableau de bord Q3 est composé de trois panneaux coordonnés qui permettent d'analyser la
dynamique d'emploi sous trois angles : la répartition spatio-temporelle du turnover (panneau G),
le classement des employeurs (panneau H) et la corrélation entre turnover et attributs
structurels (panneau I).

#### 4.3.1. Panneau G — Carte de chaleur employeur × mois

Ce panneau répond aux tâches *Summarize → Trends* et *Compare → Trends*. Il affiche une
matrice où chaque cellule représente le taux de turnover d'un employeur pour un mois donné,
colorée selon une palette séquentielle OrRd. Les employeurs sont triés par turnover moyen :
les *N* plus instables en haut, les *N* plus stables en bas, séparés par une ligne pointillée.

| Variable de données | Type (Munzner) | Marque / Canal visuel | Justification |
|---------------------|---------------|----------------------|---------------|
| Mois | Quantitatif ordonné | Position X (bande) | Échelle à bandes pour la discrétisation mensuelle |
| Employeur | Catégoriel nominal (trié) | Position Y (bande) | Tri par turnover moyen pour faciliter la comparaison |
| Taux de turnover mensuel | Quantitatif continu | Saturation de couleur (palette séquentielle OrRd) | Canal de couleur séquentiel adapté aux données positives (*Introduction*, p. 53). Les valeurs élevées (rouge foncé) attirent l'attention pré-attentive (*Introduction*, p. 18) |

**Marque utilisée** : rectangle (*cell mark*), la marque canonique des techniques basées sur
les tableaux pour données multidimensionnelles (Ghoniem & Médoc, 2026, *Multidimensionnelles*).
Ce patron d'encodage est analogue à la matrice d'adjacence du tutoriel Tuto2 (Médoc, 2026),
qui utilise un double encodage taille + couleur sur une grille de cellules — ici adapté à une
matrice employeur × mois avec un encodage couleur séquentiel unique.

#### 4.3.2. Panneau H — Diagramme en barres horizontales du turnover moyen

Ce panneau répond aux tâches *Discover → Outliers* et *Compare → Trends*. Il classe les
employeurs par taux de turnover moyen sous forme de barres horizontales : les *N* employeurs
au turnover le plus élevé en rouge, les *N* plus stables en vert, avec une ligne de référence
à la médiane.

| Variable de données | Type (Munzner) | Marque / Canal visuel | Justification |
|---------------------|---------------|----------------------|---------------|
| Taux de turnover moyen | Quantitatif continu | Longueur de la barre (position X) | Position = canal le plus précis. Les barres horizontales permettent de lire les labels d'employeurs |
| Employeur | Catégoriel nominal | Position Y (trié par turnover) | Classement visuel : fort turnover en haut, stable en bas |
| Catégorie (top *N* / bottom *N*) | Catégoriel binaire | Teinte (rouge / vert) | Cohérence chromatique avec le panneau G. Rouge = instable, vert = stable |

**Marque utilisée** : rectangle (*bar mark*), suivant le même patron que le panneau B (Q1).
L'orientation horizontale assure la lisibilité des labels sans rotation de texte.

#### 4.3.3. Panneau I — Nuage de points turnover vs taille et rémunération

Ce panneau répond aux tâches *Identify → Correlation* et *Discover → Outliers*. Il représente
chaque employeur dans un espace bidimensionnel croisant l'effectif moyen (X) et le taux de
turnover moyen (Y), avec un double encodage supplémentaire en taille (total des départs) et en
couleur (taux horaire moyen).

| Variable de données | Type (Munzner) | Marque / Canal visuel | Justification |
|---------------------|---------------|----------------------|---------------|
| Effectif moyen (`avg_headcount`) | Quantitatif continu | Position X | Canal le plus précis pour les quantités (*Introduction*, p. 34) |
| Taux de turnover moyen (`avg_turnover`) | Quantitatif continu | Position Y | Deuxième canal positionnel |
| Total des départs (`total_departures`) | Quantitatif continu | Taille du cercle (`scaleSqrt`) | Troisième canal le plus efficace. Échelle en racine carrée pour la perception proportionnelle des aires |
| Taux horaire moyen (`avg_hourly_rate`) | Quantitatif continu | Couleur (palette séquentielle RdYlGn) | Canal de couleur divergent : vert = bien rémunéré, rouge = faiblement rémunéré. Double encodage justifié par la perception pré-attentive (*Introduction*, p. 18) |

**Marque utilisée** : point (*dot mark*), suivant le même patron multi-encodé que les
panneaux C (Q1) et F (Q2). Ce scatterplot encode quatre attributs simultanément, illustrant la
technique du scatterplot pour données multidimensionnelles (Ghoniem & Médoc, 2026,
*Multidimensionnelles*) et s'inscrivant dans la lignée du tutoriel Tuto5 (Médoc, 2026). Deux
légendes (gradient de couleur + cercles de taille) accompagnent le graphique pour assurer la
lisibilité des deux canaux non positionnels.

### 4.4. Vues coordonnées et interaction

Chacun des trois tableaux de bord fonctionne comme un système de vues coordonnées multiples
(*coordinated multiple views*), concept central du cours sur les données multidimensionnelles
(Ghoniem & Médoc, 2026, *Multidimensionnelles*) et mis en œuvre dans les tutoriels Tuto5 et
Tuto6 (Médoc, 2026).

La coordination repose, pour chaque tableau de bord, sur un *slice* Redux d'interaction dédié
qui maintient les variables d'état suivantes :

| Tableau de bord | Slice d'interaction | Variables d'état |
|-----------------|---------------------|------------------|
| Q1 | `InteractionSlice` | `hoveredEmployerId`, `selectedEmployerIds`, `topN` |
| Q2 | `Q2InteractionSlice` | `hoveredResidentId`, `hoveredMonth`, `selectedResidentIds`, `selectedCluster` |
| Q3 | `Q3InteractionSlice` | `hoveredEmployerId`, `selectedEmployerIds`, `topN` |

Le mécanisme de *brushing and linking* est identique dans les trois cas : lorsque l'utilisateur
survole un élément dans n'importe quel panneau, les trois vues du tableau de bord actif
réagissent simultanément — l'élément survolé est mis en relief (opacité et épaisseur de
contour accrues) tandis que les autres éléments sont atténués. Ce patron d'interaction
coordonnée est directement issu du tutoriel Tuto6 (Médoc, 2026), où le survol d'un nœud dans
le diagramme en réseau met en surbrillance les éléments correspondants dans les autres vues.

Le tableau de bord Q2 introduit une dimension d'interaction supplémentaire : la **sélection de
cluster**. Lorsqu'un cluster est sélectionné dans le panneau F (scatter), les panneaux D (aires
empilées) et E (boîtes à moustaches) se reconfigurent pour afficher les données spécifiques à
ce cluster, avec des lignes de référence pointillées montrant les médianes de l'ensemble des
résidents — patron *focus + context*.

L'ensemble de l'application suit le mantra de Shneiderman (1996) :

1. **Vue d'ensemble** (*overview*) : chaque tableau de bord affiche simultanément les données
   de l'ensemble des entités (employeurs ou résidents) dans ses trois panneaux.
2. **Zoom et filtrage** (*zoom and filter*) : les contrôles `topN` (Q1, Q3) et la sélection de
   cluster (Q2) permettent de restreindre le sous-ensemble mis en avant.
3. **Détails à la demande** (*details-on-demand*) : le survol affiche une infobulle
   contextuelle adaptée à chaque tableau de bord — identifiant, métriques clés et rang de
   turnover (Q3) ou cluster d'appartenance (Q2).

---

## 5. Architecture technique (Munzner — niveau 4)

Le quatrième niveau du modèle imbriqué concerne les choix algorithmiques et d'implémentation.
La menace à ce niveau est la lenteur de rendu (Munzner, 2014, ch. 14) : si l'interface ne
réagit pas en temps interactif, l'utilisateur ne peut pas explorer les données de manière
fluide.

Notre architecture suit le patron d'architecture Modèle-Vue-Contrôleur (MVC) tel qu'enseigné
dans les tutoriels du cours (Médoc, 2026, Tuto4, *D3js in React*) et étendu avec Redux
(Tuto5, *MultiDim Redux*). Ce patron assure la séparation des responsabilités entre les
composants. L'ensemble des trois tableaux de bord partage la même pile technique et le même
patron de conception ; seuls les *slices* Redux, les classes D3 et les conteneurs React
diffèrent d'un onglet à l'autre.

### 5.1. Architecture client-serveur

L'application se décompose en deux modules :

- **Serveur** (Python + Flask) : prétraitement des 17 Go de données brutes via DuckDB
  (requêtes SQL en mémoire), puis exposition de trois points d'accès REST — un par question :

  | Point d'accès | Données servies | Fichiers JSON |
  |---------------|-----------------|---------------|
  | `/api/data` | Q1 — prospérité des employeurs | `monthly.json`, `employers.json` |
  | `/api/q2data` | Q2 — santé financière des résidents | `residents_monthly.json`, `residents_summary.json`, `cluster_meta.json` |
  | `/api/q3data` | Q3 — dynamique d'emploi et turnover | `turnover_monthly.json`, `employers_turnover.json` |

  Ce choix est inspiré de l'architecture client-serveur des tutoriels Tuto6 et Tuto7
  (Médoc, 2026), où un serveur Flask avec CORS fournit les données traitées au client React.

- **Client** (React 19 + Vite + D3.js 7.9 + Redux Toolkit) : application
  monopage à onglets qui charge les données de chaque question de manière paresseuse (le
  chargement n'est déclenché qu'à l'activation de l'onglet correspondant) et les stocke dans
  un *store* Redux unique.

### 5.2. Patron MVC avec Redux

Le tableau ci-dessous montre la correspondance entre les rôles MVC, nos fichiers et les
concepts des tutoriels pour l'ensemble des trois tableaux de bord :

**Slices Redux (Modèle) :**

| Slice | Rôle | Patron tutoriel |
|-------|------|-----------------|
| `DataSetSlice.js` | Chargement asynchrone des données Q1 (`createAsyncThunk` + `extraReducers` pending/fulfilled/rejected) | `DataSetSlice.js` (Tuto5) |
| `InteractionSlice.js` | Hover/sélection Q1 : `hoveredEmployerId`, `selectedEmployerIds`, `topN` | `ItemInteractionSlice.js` (Tuto6) |
| `Q2DataSlice.js` | Chargement asynchrone des données Q2 (monthly + residents + clusters) | `DataSetSlice.js` (Tuto5) |
| `Q2InteractionSlice.js` | Hover/sélection Q2 : `hoveredResidentId`, `hoveredMonth`, `selectedResidentIds`, `selectedCluster` | `ItemInteractionSlice.js` (Tuto6) |
| `Q3DataSlice.js` | Chargement asynchrone des données Q3 (monthly + employers) | `DataSetSlice.js` (Tuto5) |
| `Q3InteractionSlice.js` | Hover/sélection Q3 : `hoveredEmployerId`, `selectedEmployerIds`, `topN` | `InteractionSlice.js` (Q1) |
| `NavigationSlice.js` | Onglet actif (`activeTab` : q1, q2, q3) | Original (pas d'équivalent tutoriel) |

**Conteneurs React (Contrôleur) et classes D3 (Vue) :**

| Tableau de bord | Conteneurs (Contrôleur) | Classes D3 (Vue) | Patron tutoriel |
|-----------------|------------------------|------------------|-----------------|
| Q1 | `TimeSeriesContainer`, `BarChartContainer`, `ScatterplotContainer` | `TimeSeriesD3`, `BarChartD3`, `ScatterplotD3` | `ScatterplotContainer.js` (Tuto5), `Matrix-d3.js` (Tuto4) |
| Q2 | `AreaChartContainer`, `BoxPlotContainer`, `ResidentScatterContainer` | `AreaChartD3`, `BoxPlotD3`, `ResidentScatterD3` | Même patron Tuto4/5 |
| Q3 | `HeatmapContainer`, `TurnoverBarContainer`, `TurnoverScatterContainer` | `HeatmapD3`, `TurnoverBarD3`, `TurnoverScatterD3` | Même patron Tuto4/5 ; `HeatmapD3` s'inspire de `Matrix-d3.js` (Tuto2/4) |

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
au principe de séparation des responsabilités enseigné dans le tutoriel Tuto4. Ce cycle de vie
est identique pour les neuf classes D3 de l'application.

### 5.4. Séparation update / updateHighlighting

Nous avons introduit une optimisation non présente dans les tutoriels : chaque classe D3
expose une méthode `updateHighlighting(hoveredId, selectedIds)` distincte de `update()`. Cette
séparation des responsabilités garantit que les changements d'état d'interaction (survol, clic)
ne déclenchent pas un rebindage complet des données — seules les propriétés visuelles
(opacité, épaisseur de contour, couleur de surbrillance) sont modifiées. Cela assure une
réactivité fluide même avec plusieurs centaines d'éléments simultanés.

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
le contrôleur, puis redescend vers les trois vues coordonnées — boucle MVC complète. Ce patron
est répliqué dans les neuf conteneurs de l'application, avec des actions Redux adaptées à
chaque *slice* d'interaction.

### 5.6. Navigation par onglets

L'application propose trois onglets (Q1, Q2, Q3) gérés par un composant `TabBar.jsx` et un
*slice* Redux dédié (`NavigationSlice.js`) :

- `TabBar.jsx` rend trois boutons et dispatch l'action `setActiveTab` au clic.
- `NavigationSlice.js` maintient un état unique `activeTab` (valeur par défaut : `"q1"`).
- `App.jsx` effectue un rendu conditionnel en fonction de `activeTab`, montant le tableau de
  bord correspondant et déclenchant le chargement paresseux des données associées.

Ce mécanisme de chargement paresseux (*lazy loading*) évite de charger les données des trois
questions au démarrage : seules les données de l'onglet actif sont récupérées via
`createAsyncThunk`, les autres étant chargées à la première activation de leur onglet.

### 5.7. Pipelines de prétraitement

Trois scripts Python transforment les données brutes en fichiers JSON compacts consommables
par le client :

| Script | Entrées | Technique | Sorties |
|--------|---------|-----------|---------|
| `preprocess.py` | Activity Logs (113,9 M lignes) + Financial Journal (1,8 M lignes) + Jobs | DuckDB : jointure temporelle, agrégation mensuelle, régression linéaire | `monthly.json`, `employers.json` |
| `preprocess_q2.py` | Financial Journal + Participants | DuckDB : agrégation par catégorie + scikit-learn KMeans (méthode du coude) | `residents_monthly.json`, `residents_summary.json`, `cluster_meta.json` |
| `preprocess_q3.py` | Activity Logs + Jobs | DuckDB : détection d'arrivées/départs par comparaison d'affectations mois à mois, calcul du turnover normalisé | `turnover_monthly.json`, `employers_turnover.json` |

Le pipeline Q1 (`preprocess.py`) suit quatre étapes : (1) jointure temporelle pour résoudre
l'employeur de chaque participant par mois, (2) agrégation des salaires par employeur et par
mois, (3) calcul des pentes par régression linéaire sur les 15 mois, (4) export JSON.

Le pipeline Q2 (`preprocess_q2.py`) ajoute une étape de clustering : après le calcul des
pentes et des moyennes par résident, les indicateurs sont normalisés puis soumis à un KMeans
(scikit-learn) dont le *k* optimal est déterminé par la méthode du coude. Les labels de
cluster (Improving, Stable, Declining) sont attribués en fonction de la position des
centroïdes.

Le pipeline Q3 (`preprocess_q3.py`) reconstitue les flux de main-d'œuvre en comparant les
affectations mensuelles : une arrivée est détectée lorsqu'un participant apparaît chez un
nouvel employeur, un départ lorsqu'il quitte un employeur. Le taux de turnover mensuel est
normalisé par l'effectif pour permettre la comparaison entre employeurs de tailles différentes.

---

## 6. Guide d'utilisation

L'application s'utilise selon le mantra de Shneiderman (1996) : vue d'ensemble d'abord, zoom
et filtrage ensuite, détails à la demande enfin. La barre d'onglets en haut de l'interface
permet de basculer entre les trois tableaux de bord (Q1, Q2, Q3).

### 6.1. Onglet Q1 — Prospérité des employeurs

**1. Vue d'ensemble.** Au chargement, les trois panneaux s'affichent simultanément. Le
panneau A (séries temporelles) montre les 10 employeurs les plus prospères en vert et les 10
plus en difficulté en rouge, sur fond de l'ensemble des 253 courbes en gris. Le panneau B
(barres divergentes) classe ces 20 employeurs par pente salariale. Le panneau C (nuage de
points) positionne les 253 employeurs dans l'espace des deux pentes.

**2. Zoom et filtrage.** La barre de contrôle contient un champ numérique « Show top/bottom »
qui permet d'ajuster la valeur *N*. Augmenter *N* révèle davantage d'employeurs dans les
panneaux A et B ; le réduire concentre l'attention sur les cas les plus extrêmes.

**3. Sélection et survol.** Un clic sur un employeur dans n'importe quel panneau le
sélectionne dans les trois vues simultanément. Le survol affiche une infobulle contextuelle
indiquant l'identifiant de l'employeur, son effectif moyen, sa pente salariale, sa pente
d'effectif et sa masse salariale totale.

**4. Lecture des quadrants (panneau C).** Les lignes de référence en pointillés à zéro
divisent le nuage de points en quatre quadrants. Le quadrant supérieur droit regroupe les
employeurs prospères ; le quadrant inférieur gauche ceux en difficulté. Les quadrants mixtes
signalent des situations ambiguës méritant une investigation plus fine via les panneaux A et B.

### 6.2. Onglet Q2 — Santé financière des résidents

**1. Vue d'ensemble.** Le panneau D (aires empilées) montre l'évolution des dépenses par
catégorie et du revenu pour l'ensemble des résidents. Le panneau E (boîtes à moustaches)
affiche la distribution mensuelle du solde net. Le panneau F (nuage de points) positionne
chaque résident dans l'espace des pentes, coloré par cluster.

**2. Filtrage par cluster.** Un clic sur un cluster dans le panneau F reconfigure les
panneaux D et E pour n'afficher que les données du cluster sélectionné, avec des lignes
pointillées de référence représentant les médianes de l'ensemble des résidents (*focus +
context*).

**3. Exploration individuelle.** Le survol d'un résident dans le panneau F superpose sa
trajectoire individuelle sur les boîtes à moustaches du panneau E, permettant de situer ce
résident par rapport à la distribution générale. L'infobulle affiche le cluster
d'appartenance, le revenu moyen, les pentes et le solde net moyen.

### 6.3. Onglet Q3 — Dynamique d'emploi et turnover

**1. Vue d'ensemble.** Le panneau G (carte de chaleur) montre le taux de turnover de chaque
employeur mois par mois. Le panneau H (barres horizontales) classe les employeurs par turnover
moyen. Le panneau I (nuage de points) croise l'effectif moyen et le turnover, dimensionné par
les départs et coloré par le taux horaire.

**2. Zoom et filtrage.** Le contrôle `topN` ajuste le nombre d'employeurs affichés dans les
panneaux G et H — les *N* plus instables et les *N* plus stables.

**3. Sélection et survol.** Même mécanisme que Q1 : le survol et le clic coordonnent les
trois panneaux. L'infobulle affiche l'identifiant de l'employeur, son effectif moyen, son taux
de turnover, son nombre total de départs et son rang de turnover.

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
