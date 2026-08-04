# Task — Conception détaillée

> Module : `apps/hub/src/modules/task/`
> Référence spec : `v3/spline-v3.md` — §4.6 (entité), §4.22 (Blocker), §4.24 (invariants globaux),
> §5.7 (Task Engine), §9.5-9.6 (DAG, états), §10.9/§11 (validation), §20.6 (affordances), §22.6
> Statut : implémenté, double-vérifié (§7), audité en accessibilité.

## 1. Rôle

Une Task est **l'unité atomique de travail** : un responsable unique, un objectif de rattachement, des
critères d'acceptation. Ce module possède l'entité, son cycle de vie, ses dépendances, ses blocages, et la
synchronisation de la progression du Goal qu'elle sert — la dette explicitement laissée par le module goal.

Il ne possède pas : les Runs/Attempts (module d'exécution, §4.7-4.8 — la Task porte son *état*, pas ses
tentatives), les Validations formelles (§11), les Artifacts, ni le Repository (la tâche ne porte qu'un
`repositoryId` opaque et nullable, §4.6).

## 2. Modèle de domaine

### 2.1 `Task` (AggregateRoot)

**Props** (§4.6) : `workspaceId`, `goalId`, `repositoryId` (nullable), `title`, `description` (nullable),
`acceptanceCriteria` (jamais vide), `assignee` (ActorRef), `priority`, `status`, `dependsOnTaskIds`,
`blockers`, `estimatedCost` (nullable), `estimatedDurationMinutes` (nullable), `statusBeforeBlock`,
`createdAt`, `updatedAt`.

> §4.6 nomme ce champ `owner` ; le module l'appelle `assignee` parce que **toutes** les opérations qui le
> touchent sont des assignations. C'est le même concept : le responsable unique.

**Assignation atomique (§4.6, invariant restauré de la v1)** : `assignee` est **requis à la création**.
Il n'existe à aucun instant une Task sans responsable, donc aucune fenêtre où deux acteurs pourraient se
porter volontaires en même temps. La réassignation est un acte explicite ultérieur.

**Machine à états** (kernel `StateMachine`) :

```text
PLANNED    → READY | BLOCKED | CANCELLED
READY      → ASSIGNED | BLOCKED | CANCELLED
ASSIGNED   → RUNNING | BLOCKED | CANCELLED
RUNNING    → VALIDATING | BLOCKED | FAILED | CANCELLED
BLOCKED    → PLANNED | READY | ASSIGNED | RUNNING | VALIDATING | CANCELLED
VALIDATING → COMPLETED | RUNNING (revue refusée) | BLOCKED | FAILED | CANCELLED
FAILED     → ASSIGNED (reprise) | CANCELLED
COMPLETED → ∅ (terminal)        CANCELLED → ∅ (terminal)
```

`BLOCKED` est joignable depuis **tout état vivant** et revient vers chacun d'eux : un obstacle peut frapper
n'importe quand, et `reportBlocker` le pose sans passer par un choix d'utilisateur. La table doit décrire
ce comportement, sinon `allowedStatusTargets()` annonce moins que ce que le système fait (§7).

Les états `SCHEDULED`, `RETRYING`, `PAUSED`, `WAITING_APPROVAL` du §9.6 **n'appartiennent pas à la Task** :
ce sont des états de l'ordonnancement et des Runs, portés par le module d'exécution. La Task porte les
neuf statuts du §4.6, pas un de plus.

**`COMPLETED` n'est atteignable que depuis `VALIDATING`, et jamais par `changeStatus`** — même traitement
que le Goal, imposé cette fois par un invariant global explicite (§4.24 : « Une tâche n'est jamais terminée
sans Validation »). Une méthode `complete()` dédiée, derrière une route à permission humaine.

### 2.2 `Blocker` (entité fille, §4.22)

« Une tâche bloquée ne progresse plus. » Un Blocker porte : `id`, `type`
(`TECHNICAL | DEPENDENCY | APPROVAL | INFRASTRUCTURE | HUMAN | EXTERNAL`), `description`, `reportedBy`
(ActorRef), `reportedAt`, `resolvedAt` (nullable), `resolution` (nullable).

Il vit **dans l'agrégat Task** : il n'a pas de cycle de vie hors d'elle, et son ouverture/fermeture change
l'état de la tâche. Règles :

- signaler un blocage sur une tâche non terminale → la tâche passe `BLOCKED` et **mémorise le statut
  d'avant** (`statusBeforeBlock`) ;
- résoudre le **dernier** blocage ouvert → la tâche **revient à son statut d'avant** (une tâche bloquée en
  plein travail reprend en `RUNNING`, elle ne repart pas de zéro) ;
- s'il reste des blocages ouverts, la tâche demeure `BLOCKED` ;
- signaler un blocage sur une tâche déjà `BLOCKED` est légitime (plusieurs obstacles simultanés) et ne
  réécrit pas `statusBeforeBlock`.

### 2.3 Dépendances entre Tasks (§4.6, §9.5)

Même mécanique que les Goals, mais c'est ici qu'elle prend son sens littéral : « une tâche devient
exécutable lorsque toutes ses dépendances sont satisfaites » (§9.5). Cycles rejetés à l'écriture via le
`DependencyGraph` du kernel. Une dépendance `CANCELLED` ne bloque pas (elle ne se terminera jamais).

**Porte de mise en travail** : `PLANNED → READY` exige que toutes les dépendances soient `COMPLETED` (ou
`CANCELLED`). C'est la porte que le Scheduler consommera plus tard sans la réécrire.

### 2.4 Synchronisation de la progression du Goal

Dette du module goal, soldée ici. À chaque changement de statut de tâche, le module recalcule la
progression du Goal : `completed / (total − cancelled)`, arrondi ; un Goal sans tâche vivante reste à sa
valeur courante (on ne remet pas à zéro un objectif dont on vient d'annuler la dernière tâche).

Le calcul vit dans un service applicatif du module task, qui appelle `UpdateGoalProgressUseCase` exporté
par le module goal — sens de dépendance task → goal, jamais l'inverse.

## 3. Couche application

Chaque use-case a une route (leçon de l'audit d'accessibilité) :

- `CreateTaskUseCase` — workspace ACTIVE, goal existant/même workspace/non terminal, assignee obligatoire
  et membre du workspace avec un rôle exécutant, critères non vides.
- `GetTaskUseCase` / `ListTasksUseCase` (filtres `goalId`, `status`, `assignee`; tri priorité puis âge).
- `UpdateTaskDetailsUseCase` — titre, description, critères, priorité, estimations, `repositoryId`.
- `AssignTaskUseCase` — réassignation explicite (vérifie l'appartenance du nouveau responsable).
- `ChangeTaskStatusUseCase` — machine à états + porte de dépendances sur `READY` ; refuse `COMPLETED`.
- `CompleteTaskUseCase` — seule voie vers `COMPLETED`, exige `VALIDATING`.
- `ReportBlockerUseCase` / `ResolveBlockerUseCase`.
- `ManageTaskDependencyUseCase` — ajout/retrait, rejet de cycle.
- `GoalProgressSyncService` — recalcul (§2.4).

## 4. Infrastructure

Modèle Prisma `Task` : FK workspace (Cascade), FK goal (Cascade — une tâche n'a pas de sens sans son
objectif), `assigneeType`/`assigneeId`, `acceptanceCriteria`/`dependsOnTaskIds`/`blockers` en Json,
`estimatedCost` (Float nullable), `estimatedDurationMinutes` (Int nullable), `statusBeforeBlock`, enums
`TaskStatus` et `Priority` (réutilisé), index `[workspaceId, status]`, `[goalId]`,
`[assigneeType, assigneeId]`. Repository §5.19 (agrégat complet), `findById`, `list(filter)`,
`tallyByGoal` (alimente la progression sans charger toutes les tâches).

Les blockers sont un tableau Json dans l'agrégat : ils n'ont pas d'existence hors de la tâche, donc pas de
table propre — cohérent avec le choix fait pour les dépendances.

## 5. Interface

Toutes sous `/workspaces/:workspaceId/tasks`, chacune avec une permission qui a du sens pour l'acte :

| Route | Permission | Pourquoi |
| --- | --- | --- |
| `POST /` | `manage_tasks` | créer et assigner, c'est de la conduite |
| `GET /` et `GET /:taskId` | `read_workspace_state` | |
| `PATCH /:taskId` | `manage_tasks` | |
| `POST /:taskId/assign` | `manage_tasks` | réassigner |
| `POST /:taskId/status` | `execute_tasks` | l'exécutant fait avancer son propre travail |
| `POST /:taskId/submit` | `request_validation` | soumettre à validation (§10.9) |
| `POST /:taskId/complete` | `approve_validation` | **humains uniquement** — l'agent soumet, il ne valide pas |
| `POST /:taskId/cancel` | `manage_tasks` | |
| `POST /:taskId/blockers` | `execute_tasks` | signaler un obstacle est un acte d'exécution |
| `POST /:taskId/blockers/:blockerId/resolve` | `manage_tasks` | lever un obstacle relève de la conduite |
| `POST /:taskId/dependencies` + `DELETE .../:dependsOnTaskId` | `manage_tasks` | |
| `GET /mine` | `read_workspace_state` | la file de l'appelant — ce qu'un agent demande à son réveil |

Vues avec `allowedStatusTargets` et `openBlockerCount` (§20.6).

## 6. Décisions notables

| Décision | Raison |
| --- | --- |
| `assignee` obligatoire à la création | §4.6 : jamais de fenêtre « à prendre » où deux acteurs se portent volontaires. L'invariant est structurel, pas procédural. |
| `statusBeforeBlock` mémorisé | Une tâche bloquée en plein travail doit **reprendre** où elle en était ; la faire repartir de `READY` perdrait l'information et forcerait une réassignation inutile. |
| Blockers dans l'agrégat, pas en table | Ils n'ont pas de cycle de vie propre : ouvrir/fermer un blocage change l'état de la tâche. Même raisonnement que pour les dépendances. |
| `COMPLETED` derrière `approve_validation` | §4.24 l'exige comme invariant global ; encoder la séparation dans la route la rend inviolable, pas seulement recommandée. |
| Statuts §9.6 exclus de la Task | `SCHEDULED`/`RETRYING`/`PAUSED` décrivent l'ordonnancement et les tentatives, pas la tâche. Les mélanger rendrait la machine impossible à raisonner. |
| Signaler un blocage = `execute_tasks`, le résoudre = `manage_tasks` | Celui qui bute signale ; celui qui pilote débloque. Donner les deux à l'exécutant lui permettrait de masquer ses propres obstacles. |
| Progression calculée par task → goal, jamais l'inverse | Le sens de dépendance reste unique ; le goal ne lit jamais les tâches, il reçoit une valeur. |

## 7. Double vérification de complétude

Relecture faite contre la spec v3 entière après le premier vert (299 unitaires / 63 e2e à ce moment).
Deux **vrais défauts** trouvés, tous deux invisibles depuis les tests qui passaient :

- **Un Goal pouvait être déclaré atteint alors que ses tâches tournaient encore.** `CompleteGoalUseCase`
  ne vérifiait que les sous-goals, jamais les tâches — un objectif à 33 % de progression pouvait donc être
  complété. Corrigé par inversion de dépendance : le **goal déclare le port** `GoalWorkloadPort`
  (la règle lui appartient), le côté task le **fournit** (il détient les faits). Aucun import goal → task
  n'apparaît.
  *Piège de câblage rencontré au passage* : Nest résout les jetons d'un provider **dans son propre
  module**, donc une liaison déclarée dans `TaskModule` n'atteignait jamais `CompleteGoalUseCase`, qui vit
  dans `GoalModule` — et faire importer `TaskModule` par `GoalModule` fermerait un cycle. La liaison est
  donc portée par un module `@Global()` dédié (`GoalWorkloadModule`), seule solution qui satisfasse les
  deux sens sans `forwardRef`. Le premier essai passait les tests unitaires et échouait en e2e : c'est
  l'e2e qui a révélé la faute.
- **La machine à états mentait sur les blocages.** `reportBlocker` posait `BLOCKED` directement, hors
  table de transitions ; or `VALIDATING → BLOCKED` et `PLANNED → BLOCKED` n'y figuraient pas.
  `allowedStatusTargets()` annonçait donc moins que ce que le système faisait réellement, et une tâche
  bloquée pendant sa validation restaurait un statut que la table déclarait inatteignable. La table admet
  désormais `BLOCKED` depuis tout état vivant et le retour vers chacun d'eux — elle décrit ce qui se passe.

Éléments vérifiés conformes : les quinze champs §4.6 et les neuf statuts, sans un de plus (les états
`SCHEDULED`/`RETRYING`/`PAUSED` du §9.6 restent à l'ordonnancement) ; assignation atomique prouvée e2e
(création sans assignee → 400) ; validité sans `repositoryId` ; les six types de Blocker §4.22 ;
« jamais terminée sans validation » §4.24 encodé dans la route (`approve_validation`), prouvé e2e par un
agent qui soumet puis reçoit 403 sur la complétion ; §9.5 porte de dépendances et rejet de cycle ;
§5.19 prouvé par rechargement d'un agrégat muté, y compris la mémoire `statusBeforeBlock`.

**Audit d'accessibilité** (discipline née de la revue du module précédent) : les onze use-cases ont une
route ; `GoalProgressSyncService` est le seul sans, à raison — c'est un service interne, pas une opération
exposable. Cinq permissions jusque-là mortes sont désormais atteignables : `manage_tasks` (7 routes),
`execute_tasks` (2), `request_validation` (1), `approve_validation` (2 avec le goal). Restent à zéro
route `acquire_locks`, `manage_processes`, `record_decisions`, `manage_machines`, `manage_extensions`,
`manage_providers` — leurs modules n'existent pas encore.

Reports explicites (décidés, pas oubliés) :

- ~~Un assignee qui perd son appartenance au workspace~~ : **soldé**. Identity déclare
  `ActorWorkloadPort`, le côté task le fournit, et la révocation est refusée (409) tant que l'acteur détient
  du travail vivant — il faut le réassigner ou le clore d'abord. Même patron d'inversion que
  `GoalWorkloadPort`, même câblage global.
- ~~Annuler un Goal ne propage rien à ses tâches~~ : **soldé**, et par l'événementiel plutôt que par un
  appel direct. `CancelTasksOnGoalCancelledListener` réagit à `goal.status_changed` → `CANCELLED` et annule
  les tâches vivantes de l'objectif, sans jamais toucher aux tâches déjà closes (l'histoire ne se réécrit
  pas). C'est le **premier consommateur réel** du bus d'événements : jusqu'ici on publiait sans que
  personne n'écoute. L'événement a dû gagner son `workspaceId` au passage — un fait doit se suffire à
  lui-même pour être consommable (§14).
- **Runs et Attempts** (§4.7-4.8) : la Task porte son *état*, pas ses tentatives ; c'est le module
  d'exécution qui les apportera.
