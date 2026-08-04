# Goal — Conception détaillée

> Module : `apps/hub/src/modules/goal/`
> Référence spec : `v3/spline-v3.md` — §4.5 (entité), §5.6 (Goal Engine), §10.9/§11 (validation),
> §9.7 (priorités), §22.6 (machine à états), §20.6 (affordances)
> Statut : implémenté, double-vérifié (245 tests unitaires, 42 e2e).

## 0. Intégration — analyse rétroactive

*Section ajoutée après coup. Elle a produit une correction : voir §0.4.*

### 0.1 Ce que goal est dans le système

Le **niveau de pilotage** : on dirige par résultat attendu, pas par micro-action. Un Goal ne sait rien du
domaine de travail de ses tâches — c'est ce qui permet à Spline de servir autre chose que du logiciel.

### 0.2 Ce qu'il consomme et fournit

Consomme workspace (ACTIVE requis) et identity (owner, permissions). Fournit à task le rattachement
obligatoire (`goalId`) et, via `GOAL_WORKLOAD`, l'inversion qui lui permet d'imposer ses règles sans
importer task.

### 0.3 Ce que les modules à venir en attendront

| Module futur | Attente |
| --- | --- |
| **Validation** (§11) | brancher son pipeline sur `REVIEW → COMPLETED` sans changer la machine — la transition est déjà isolée derrière `complete()` et `approve_validation` |
| **Scheduler** (§9) | lire priorités et dépendances pour ordonner — les deux existent |
| **Memory** (§16.5) | « Goal Memory : objectifs, contraintes, décisions, avancement » — tout est là sauf les décisions (module Decision) |

### 0.4 Ce que l'audit rétroactif a trouvé — et corrigé

**Le calcul de progression vivait dans le module task**, alors que §5.6 met explicitement « calcul du
pourcentage » sous la responsabilité du Goal Engine. La règle (ce que *signifie* progresser) appartient
au Goal ; les faits (combien de tâches sont closes) appartiennent à Task. La formule a été déplacée ici
(`RecomputeGoalProgressUseCase`), le module task ne faisant plus que déclencher le recalcul via le port
`GOAL_WORKLOAD` — étendu d'un `tally()` pour l'occasion.

## 1. Rôle

Un Goal est un résultat observable : il décrit **ce qui doit être atteint, jamais comment** (§4.5). Ce
module possède l'entité, sa hiérarchie (sous-objectifs), son cycle de vie, sa progression, et les règles
de clôture. Il ne connaît ni les providers ni le domaine de travail des tâches qui le servent (§5.6) —
aucun mot de ce module ne parle de code, de Git ou d'un quelconque Engine.

Il ne possède pas : les Tasks (module task, qui référencera `goalId` et alimentera la progression), les
Validations formelles (module validation, plus tard — voir §3 pour l'interim), les Blockers (entité du
module task, §4.22).

## 2. Modèle de domaine

### 2.1 `Goal` (AggregateRoot)

**Props** : `workspaceId`, `parentGoalId` (nullable — hiérarchie), `title`, `description` (nullable),
`successCriteria` (liste de chaînes, **jamais vide** — invariant §4.5 « possède des critères de succès »),
`dependsOnGoalIds` (§5.6), `priority`, `owner` (ActorRef — humain ou agent manager), `progress` (0-100),
`status`, `createdAt`, `updatedAt`.

**Machine à états** (kernel `StateMachine`) :

```text
PLANNED → ACTIVE | CANCELLED
ACTIVE  → BLOCKED | REVIEW | CANCELLED
BLOCKED → ACTIVE | CANCELLED
REVIEW  → COMPLETED | ACTIVE (retour de revue) | CANCELLED
COMPLETED → ∅ (terminal)      CANCELLED → ∅ (terminal)
```

**`COMPLETED` n'est atteignable que depuis `REVIEW`** — c'est la traduction structurelle de « un Goal ne
peut être terminé sans validation » (§4.5) tant que le module validation n'existe pas : le passage en
revue est l'étape de soumission, la complétion est l'approbation. Le module validation branchera son
pipeline sur cette même transition sans la changer.

**Comportements** : `updateDetails` (titre/description/critères/priorité — interdit depuis un état
terminal), `changeStatus` (§22.6 : idempotent, résultats typés), `updateProgress(value)` (0-100 gardé ;
sera alimenté par les événements du module task — exposé dès maintenant pour que le contrat existe),
`allowedStatusTargets()` (§20.6).

**Événements** : `goal.created`, `goal.updated`, `goal.status_changed`, `goal.progress_updated`
(uniquement sur changement réel de valeur).

### 2.2 Hiérarchie

Un Goal peut avoir des sous-Goals (§4.5). Invariants vérifiés en application (le domaine ne voit qu'un
`parentGoalId` opaque) :

- le parent existe, appartient au **même workspace**, et n'est pas dans un état terminal ;
- pas de cycle : la chaîne des parents est remontée à l'insertion et au re-parentage — jamais découverte
  plus tard (même philosophie que `DependencyGraph`, §9.5) ;
- un parent ne peut pas être complété si un enfant est encore actif (vérifié à la transition
  `REVIEW → COMPLETED`).

### 2.3 Dépendances entre Goals (§5.6)

Un Goal peut dépendre d'autres Goals du **même workspace** : `addDependency` / `removeDependency`
(idempotents, interdits sur un goal terminal). L'agrégat ne connaît que des ids opaques ; l'application
vérifie l'existence, le workspace, et **rejette les cycles à l'écriture** en rejouant le graphe du
workspace dans le `DependencyGraph` du kernel (§9.5 — son premier consommateur réel).

**Porte d'activation** : un Goal ne peut passer `ACTIVE` que si toutes ses dépendances sont `COMPLETED`
— ou `CANCELLED`, puisqu'une dépendance annulée ne se terminera jamais et ne doit pas bloquer
indéfiniment. Les autres transitions (dont `CANCELLED`) ne sont pas soumises à cette porte.

### 2.4 Priorités (kernel)

`PLANNED`… utilise les cinq niveaux §9.7 : `CRITICAL | HIGH | NORMAL | LOW | BACKGROUND` (défaut
`NORMAL`). Deux consommateurs connus (Goal maintenant, Task ensuite) → la liste entre au kernel
(`kernel/domain/priority.ts`), conformément à la règle des deux consommateurs.

## 3. Couche application

- `CreateGoalUseCase` — workspace ACTIVE requis ; owner humain ou agent (pas worker/service) ; critères
  non vides ; contrôles de hiérarchie (§2.2).
- `GetGoalUseCase` / `ListGoalsUseCase` (filtre optionnel `parentGoalId` — `null` pour les racines —,
  tri priorité puis ancienneté).
- `UpdateGoalDetailsUseCase` — délégué à l'entité ; re-parentage exclu (déplacement d'arbre = décision
  produit à part, non couverte en V1, reporté explicitement).
- `ChangeGoalStatusUseCase` — refuse la cible `COMPLETED` (message orientant vers la complétion) ; le
  reste passe par la machine.
- `CompleteGoalUseCase` — la seule voie vers `COMPLETED` : exige `REVIEW`, vérifie qu'aucun sous-goal
  n'est encore ouvert, force `progress = 100`.
- `UpdateGoalProgressUseCase` — appelé aujourd'hui par la route dédiée, demain par les événements du
  module task ; no-op silencieux si la valeur ne change pas.
- `ManageGoalDependencyUseCase` — ajout/retrait d'une dépendance, avec rejet de cycle (§2.3).

## 4. Infrastructure

Modèle Prisma `Goal` : FK workspace (Cascade), FK parent self-relation (`Restrict` — on ne supprime pas
physiquement un goal parent ; l'annulation est le chemin normal), `successCriteria Json`,
`priority`/`status` enums, `ownerType`/`ownerId`, index `[workspaceId, status]`, `[parentGoalId]`.
Repository §5.19 (agrégat complet), `findById`, `list(filter)`, `hasOpenChildren`.
`dependsOnGoalIds` est un tableau JSON : les dépendances sont un attribut de l'agrégat, pas une table
d'association — elles n'ont ni identité ni cycle de vie propre.

## 5. Interface

- `POST /workspaces/:workspaceId/goals` — `manage_goals`.
- `GET /workspaces/:workspaceId/goals` (+ `?parentGoalId=`) — `read_workspace_state`.
- `GET /workspaces/:workspaceId/goals/:goalId` — `read_workspace_state`.
- `PATCH /workspaces/:workspaceId/goals/:goalId` — `manage_goals`.
- `POST .../goals/:goalId/status` — `manage_goals` ; 409/410 selon `fromTerminal` ; cible `COMPLETED`
  refusée en 400 avec orientation.
- `POST .../goals/:goalId/complete` — **`approve_validation`** : un agent manager amène un goal jusqu'en
  `REVIEW`, seul un humain le complète (§10.9/§11 encodé dans la route, pas seulement dans la matrice).
- `POST .../goals/:goalId/progress` — `manage_goals`.
- `POST .../goals/:goalId/dependencies` et `DELETE .../dependencies/:dependsOnGoalId` — `manage_goals` ;
  409 sur cycle ou dépendance inter-workspace.
- Vues avec `allowedStatusTargets` et `dependsOnGoalIds` (§20.6). e2e : cycle complet, hiérarchie,
  complétion agent → 403, enfant ouvert → 409, cycle de dépendance → 409, porte d'activation.

## 6. Décisions notables

| Décision | Raison |
| --- | --- |
| `COMPLETED` uniquement via `REVIEW`, et via une route à permission humaine | « Jamais terminé sans validation » doit être un chemin structurel, pas une consigne ; le module validation s'y branchera sans rien casser. |
| Cycle de hiérarchie vérifié à l'écriture | Même principe que le DAG kernel : un état invalide ne doit jamais être persisté puis découvert. |
| Re-parentage hors V1 | Déplacer un sous-arbre touche progression, complétion parentale et audit — décision produit entière, pas un PATCH anodin. |
| `progress` stocké, pas calculé à la lecture | Le calcul appartient au module task (événements) ; stocker évite un couplage de lecture inversé goal→tasks et garde les listes rapides. |
| Priorités au kernel | Deux consommateurs connus (Goal, Task) — la règle d'entrée est satisfaite, et §9.7 les définit comme vocabulaire système, pas métier. |
| Dépendances en tableau JSON, pas en table d'association | Elles n'ont ni identité ni cycle de vie propre : ce sont des attributs de l'agrégat, et §5.19 (sauvegarde complète) les rend cohérentes sans jointure. |
| Une dépendance `CANCELLED` ne bloque pas l'activation | Elle ne se terminera jamais : la traiter comme bloquante figerait le dépendant pour toujours sans qu'aucune action ne puisse le débloquer. |

## 7. Double vérification de complétude

Relecture faite contre la spec v3 entière après le premier vert (228 unitaires / 41 e2e à ce moment).
La passe a trouvé un **vrai manque fonctionnel**, pas seulement des détails :

- **Dépendances entre Goals absentes.** §5.6 liste explicitement « dépendances » parmi les
  responsabilités du Goal Engine, alors que la liste de champs §4.5 ne les mentionne pas — c'est
  l'écart entre les deux sections qui me les avait fait manquer. Ajoutées entièrement (§2.3) : domaine,
  rejet de cycle via le `DependencyGraph` du kernel, porte d'activation, persistance, routes
  `POST/DELETE .../dependencies`, e2e. C'est aussi ce qui donne au `DependencyGraph` son premier
  consommateur réel — il avait été écrit pour le Scheduler, il sert d'abord ici.
- **`ancestorIds` était du code mort.** Le port et son implémentation Prisma existaient, sans aucun
  appelant : à la création un nouveau goal n'a pas d'enfant, donc aucun cycle hiérarchique n'est
  possible, et le re-parentage est hors V1. Supprimé plutôt que gardé « au cas où » — un port mort ment
  sur ce que le module fait.

Éléments vérifiés conformes : champs, statuts et invariants §4.5 ; « jamais terminé sans validation »
rendu structurel (COMPLETED inatteignable par `changeStatus`, route dédiée sous `approve_validation`,
testé e2e avec un vrai agent manager qui reçoit 403) ; hiérarchie (parent existant, même workspace, non
terminal ; complétion bloquée par un enfant ouvert) ; priorités §9.7 au kernel ; agnosticisme de domaine
(aucune mention de code/Git/Engine) ; §22.6 de bout en bout (idempotence, 409/410 selon `fromTerminal`) ;
affordances §20.6 avec `COMPLETED` jamais listé ; §5.19 prouvé par test d'intégration.

Reports explicites (décidés, pas oubliés) :

- **Calcul automatique de `progress`** : §5.6 le confie au Goal Engine, mais la source de vérité est
  l'état des tâches. `UpdateGoalProgressUseCase` est en place et exporté ; le module task le branchera
  sur ses événements. Stocker plutôt que calculer à la lecture garde le couplage à sens unique.
- **Re-parentage** : hors V1 (déplacer un sous-arbre touche progression, complétion parentale et audit).
- **Goals « à risque »** : le statut `at_risk` de la v1 n'existe pas en v3 (§4.5) ; la détection de
  risque relèvera de l'observabilité, pas d'un état supplémentaire.
