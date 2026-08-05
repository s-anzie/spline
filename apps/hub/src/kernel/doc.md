# Kernel — Conception détaillée

> Module : `apps/hub/src/kernel/`
> Référence spec : `v3/spline-v3.md` — §1.3 (principes), §4.24 (invariants globaux), §5.19 (persistance),
> §9.5 (DAG), §17.7 (seuils de staleness), §20.6 (contraintes visibles), §22.6 (machines à états)
> Statut : implémenté, 14 suites / 85 tests unitaires verts, lint et types propres.

## 1. Rôle

Le kernel est le socle partagé de tous les modules métier du hub. Il fournit :

- les **primitives de domaine** : identité, entités, agrégats, value objects, résultats, erreurs, événements ;
- les **règles transversales** imposées par la spec v3 : machines à états idempotentes (§22.6), graphe de
  dépendances acyclique (§9.5), arithmétique canonique de péremption (§17.7) ;
- les **gardes de validation** que toutes les factories d'entités utilisent ;
- les **conventions de la couche application** : interface `UseCase`, publication d'événements après
  persistance ;
- les deux **ports d'infrastructure** consommés partout : horloge, publication d'événements — avec leurs
  implémentations par défaut et leurs doubles de test.

Il ne contient **aucune logique métier** : pas d'entité Spline (Workspace, Task, Agent…), pas de règle
produit. Tout ce qui s'y trouve doit être vrai pour n'importe quel module, présent ou futur — y compris un
Engine communautaire (spec §19) qui suivrait les mêmes conventions.

**Critère d'entrée au kernel** : une primitive n'y entre que si au moins deux modules distincts en ont
besoin, et qu'elle ne porte aucune connaissance métier. Une seule exception assumée : les primitives exigées
nommément par la spec (StateMachine §22.6, DependencyGraph §9.5, staleness §17.7) sont entrées dès la
fondation, précisément pour que les modules ne puissent pas naître sans elles.

## 2. Responsabilités / Non-responsabilités

**Responsable de :**

- La convention de retour des échecs attendus (`Result<T, E>`) — jamais d'exception pour un échec métier.
- L'identité et l'égalité : par identité pour les entités (`Entity`, `UniqueEntityId`), par structure pour
  les value objects (`ValueObject`).
- La validation d'arguments des factories (`Guard`) et la hiérarchie d'erreurs (`DomainError`,
  `GuardViolation`, `InvalidStateTransitionError`, `EntityNotFoundError`).
- La collecte des événements de domaine (`AggregateRoot`, `DomainEvent`, `BaseDomainEvent`) et leur
  publication ordonnée (`flushDomainEvents`).
- La règle transversale §22.6 sur les transitions d'état (`StateMachine`).
- Le graphe de dépendances acyclique (`DependencyGraph`) — Scheduler (§9.5), graphe de validations (§11.9),
  dépendances de Goals, propagation de blocage.
- L'arithmétique de péremption (`staleness.ts`) — TTL, baux, heartbeats (§17.7, §4.13, §6.4).
- Les ports `Clock` et `EventPublisher`, leurs implémentations par défaut, et leurs doubles de test.

**Jamais responsable de :**

- Persistance (aucun import Prisma ici).
- Transport (aucun import HTTP/WebSocket).
- Logique métier d'un module (un module qui aurait besoin de « personnaliser » une primitive du kernel doit
  composer, pas modifier le kernel).
- DTOs et mapping — conventions de la couche interface.
- ~~Pagination~~ : les bornes de page **sont** montées ici après l'audit du §5.4 — onze modules en
  dépendaient et aucun ne portait de connaissance métier. La phrase précédente disait « définies quand le
  premier contrôleur existera » ; quatorze modules plus tard, huit d'entre eux n'en avaient aucune.

## 3. Structure

```text
kernel/
├── domain/               # primitives pures, zéro dépendance framework (sauf node:crypto)
│   ├── result.ts             Result<T, E> : ok/fail, map, flatMap, mapError, combine
│   ├── domain-error.ts       DomainError (base de toutes les erreurs métier)
│   ├── errors.ts             InvalidStateTransitionError, EntityNotFoundError (base)
│   ├── guard.ts              Guard.* + GuardViolation
│   ├── unique-entity-id.ts   UniqueEntityId
│   ├── entity.ts             Entity<Props>           (égalité par identité)
│   ├── value-object.ts       ValueObject<Props>      (égalité structurelle, props gelées)
│   ├── aggregate-root.ts     AggregateRoot<Props>    (collecte d'événements)
│   ├── domain-event.ts       DomainEvent (interface)
│   ├── base-domain-event.ts  BaseDomainEvent         (occurredAt injecté, copié)
│   ├── state-machine.ts      StateMachine<S> + TransitionOutcome<S>       (§22.6)
│   ├── dependency-graph.ts   DependencyGraph + DependencyCycleError       (§9.5)
│   ├── staleness.ts          ageMs, isExpired, isStale                    (§17.7)
│   ├── pagination.ts         pageSize — aucune liste ne rend une table entière (§5.4)
│   └── ports/
│       ├── clock.port.ts             Clock + jeton CLOCK
│       ├── event-publisher.port.ts   EventPublisher + jeton EVENT_PUBLISHER
│       └── audit-trail.port.ts       AuditTrail + jeton AUDIT_TRAIL (non lié : §18.1)
├── application/          # conventions de la couche application
│   ├── use-case.ts               UseCase<Input, Output> (une classe = une opération)
│   ├── flush-domain-events.ts    flushDomainEvents(aggregate, publisher)
│   └── reaction-depth.ts         borne une cascade de réactions (§5.2)
├── interface/            # conventions de la couche interface
│   └── domain-error.mapping.ts   toHttpException(error, mapping)
├── infrastructure/       # implémentations par défaut (peuvent importer Nest)
│   ├── system-clock.ts                   Clock → new Date()
│   └── event-emitter-event-publisher.ts  EventPublisher → EventEmitter2 (non liée : voir §7)
├── testing/              # doubles pour les tests des autres modules
│   ├── fake-clock.ts             horloge gelée, set/advance explicites
│   ├── fake-event-publisher.ts   capture les événements publiés
│   └── fake-audit-trail.ts       capture ce qui aurait été audité
└── kernel.module.ts      # module Nest @Global : bind CLOCK (et lui seul — §7)
```

Règle de dépendance stricte : `domain/` n'importe rien hors de lui-même (exception assumée : `node:crypto`
pour les UUID). `application/` importe `domain/` uniquement. `infrastructure/` importe `domain/` et le
framework. `testing/` importe `domain/` uniquement.

## 4. Composants

### 4.1 `Result<T, E>`

Tout échec **attendu** (violation d'invariant, transition refusée, conflit) circule dans un `Result`, jamais
dans une exception. Les exceptions restent réservées aux erreurs de programmation (lire `.value` d'un échec
lève, volontairement, pour attraper les bugs au plus tôt).

API : `Result.ok(value)`, `Result.fail(error)`, `isSuccess` / `isFailure`, `value` / `error`,
`Result.combine([...])` (premier échec gagne), `map(fn)`, `flatMap(fn)` (chaînage court-circuitant),
`mapError(fn)` (adaptation d'erreur entre couches).

`flatMap` sert les validations en chaîne des factories ; `mapError` sert la couche application quand elle
traduit une erreur de domaine en erreur applicative sans toucher au succès.

### 4.2 `DomainError` et la hiérarchie d'erreurs

`DomainError` fixe `name` au nom de la classe concrète — les erreurs restent identifiables après
sérialisation/log. Chaque module déclare ses erreurs dans `domain/<module>.errors.ts` en l'étendant.
Jamais de `throw new Error("...")` dans le domaine.

Deux erreurs standardisées vivent au kernel parce que leur forme doit être uniforme dans tout le système :

- **`InvalidStateTransitionError`** — construite depuis un `TransitionOutcome` de kind `invalidTransition` ;
  porte `from`, `to`, `fromTerminal`. La couche interface s'appuie sur `fromTerminal` pour distinguer
  « conflit » (409) de « parti pour toujours » (410) sans regarder le module concerné.
- **`EntityNotFoundError`** — abstraite : chaque module la sous-classe (`TaskNotFoundError`…) pour garder
  des types précis avec un message uniforme (`Task "t-42" was not found`). Porte `entityName` / `entityId`.

### 4.3 `Guard`

Les factories d'entités (`create()`) valident leurs arguments par `Guard` au lieu de réécrire
trim/null/range à la main — sémantique et messages uniformes partout :

- `Guard.againstEmpty(value, name)` → échec sur null/undefined/vide/blanc, **succès avec la valeur trimée**
  (la normalisation est le comportement voulu, pas un effet de bord) ;
- `Guard.againstNullOrUndefined(value, name)` → les valeurs falsy présentes (0, `""`, `false`) passent ;
- `Guard.againstNegative(value, name)` → zéro et positifs finis seulement (NaN/Infinity rejetés).

Tous retournent `Result<_, GuardViolation>` ; `GuardViolation` porte `argumentName`. Composables avec
`Result.combine` :

```ts
const name = Guard.againstEmpty(input.name, "name");
const owner = Guard.againstEmpty(input.ownerId, "ownerId");
const guards = Result.combine([name, owner]);
if (guards.isFailure) return Result.fail(guards.error);
```

### 4.4 `UniqueEntityId`, `Entity<Props>`, `ValueObject<Props>`, `AggregateRoot<Props>`

- `UniqueEntityId` : UUID généré si absent, égalité par valeur, `toString()`.
- `Entity` : égalité **par identité** (deux entités sont la même ssi leurs ids sont égaux, quelles que
  soient leurs propriétés). Constructeur `protected` : les entités concrètes s'instancient par des factories
  statiques (`Workspace.create(...)`) qui valident les invariants et retournent un `Result` — l'entité
  invalide est inreprésentable.
- `ValueObject` : égalité **structurelle** (même type concret + mêmes props, les `Date` comparées par
  valeur), props **gelées** (`Object.freeze`) — un value object ne mute jamais, le comportement retourne une
  nouvelle instance. Deux types concrets différents ne sont jamais égaux, même à props identiques.
  Usage prévu : statuts riches, fenêtres de quota (§4.14), critères de succès, contraintes de scheduling.
- `AggregateRoot` : ajoute la collecte d'événements. `addDomainEvent` est `protected` (seul le comportement
  de l'agrégat lève un événement) ; `domainEvents` retourne une copie (un instantané pris avant le vidage
  reste exploitable) ; `clearDomainEvents` est appelé **après persistance réussie** — via
  `flushDomainEvents`, jamais à la main.

### 4.5 `DomainEvent` et `BaseDomainEvent`

`DomainEvent` (interface) : un fait accompli, jamais une intention (spec §4.20). `eventName` en segments
pointés (`workspace.created`, `task.status_changed`) pour les abonnements par joker (`workspace.*`, `**`)
côté relais temps réel. Porte `occurredAt` et `aggregateId`.

`BaseDomainEvent` (classe abstraite) est la façon **imposée** d'écrire un événement concret : `occurredAt`
est un argument obligatoire du constructeur — fourni par l'entité, qui le tient du use-case, qui le tient de
`CLOCK`. Il n'existe aucun défaut `new Date()` : l'horloge ne peut pas fuiter dans le domaine par oubli.
La date est copiée à la construction — muter l'objet `Date` d'origine après coup ne réécrit pas l'histoire.

### 4.6 `StateMachine<S>` — règle transversale §22.6

**L'ajout structurant de la v3**, né d'un bug réel (arrêt d'une session déjà arrêtée → 500). Toute machine à
états du système (Task, Session, Worker, Validation, Lock, Extension…) déclare sa table de transitions et la
fait arbitrer par cette classe :

- transition vers l'état courant → `{ kind: "alreadyInState" }` : **no-op réussi**, jamais une erreur ;
- transition non déclarée → `{ kind: "invalidTransition", fromTerminal }` : résultat typé ; le drapeau
  distingue « impossible depuis un état terminal » de « transition simplement interdite » ;
- transition déclarée → `{ kind: "transitioned" }`.

**Rien ne lève jamais.** Un état est terminal ssi sa liste de transitions sortantes est vide — dérivé de la
table, pas déclaré à part (impossible de désynchroniser les deux). `allowedFrom(state)` expose les cibles
atteignables : c'est la source des affordances que l'interface affiche **avant** que l'utilisateur ne se
heurte à un refus (§20.6 — la leçon du bouton « Reprendre » affiché sur des sessions non reprenables).
`can(from, to)` interroge la table sans transiter.

Usage type dans une entité :

```ts
private static readonly machine = new StateMachine<TaskState>({ ... });

changeStatus(next: TaskState, now: Date): Result<void, InvalidStateTransitionError> {
  const outcome = Task.machine.transition(this.props.state, next);
  switch (outcome.kind) {
    case "alreadyInState":
      return Result.ok(undefined);                       // idempotent, aucun événement
    case "invalidTransition":
      return Result.fail(new InvalidStateTransitionError("Task", outcome));
    case "transitioned":
      this.props.state = outcome.to;
      this.addDomainEvent(new TaskStatusChanged(this.id.value, now, ...));
      return Result.ok(undefined);
  }
}
```

### 4.7 `DependencyGraph` — §9.5

DAG à insertion contrôlée : `addDependency(node, dependsOn)` **rejette le cycle au moment de l'insertion**
(`DependencyCycleError` dans un `Result`), jamais découvert plus tard pendant l'ordonnancement.
Auto-dépendance rejetée. Les nœuds inconnus sont enregistrés implicitement.

- `readyNodes(completed)` : fonction pure de l'ensemble des nœuds accomplis → nœuds exécutables maintenant.
  La primitive du Scheduler (« une tâche devient exécutable lorsque toutes ses dépendances sont satisfaites »).
- `dependentsOf(node)` : qui est bloqué si ce nœud échoue — la primitive de la propagation de blocage
  (Goal Engine « détection des objectifs bloqués », Scheduler états `BLOCKED`).
- `dependenciesOf(node)` : dépendances directes uniquement.
- `topologicalOrder()` : dépendances avant dépendants, ordre d'insertion préservé à égalité (déterminisme).
- `nodes()`, `hasNode(id)` : inventaire.

### 4.8 `staleness.ts` — §17.7

Les trois fonctions canoniques de toute décision temporelle. Motivation vécue : une comparaison naïve de
timestamps (offsets mélangés) a produit un faux diagnostic de machine morte pendant l'exploitation v1 —
l'arithmétique de dates n'est plus jamais écrite sur un site d'appel.

- `ageMs(since, now)` : âge signé (négatif pour une date future).
- `isExpired(expiresAt, now)` : expiré **dès l'instant exact** de l'échéance (`>=`) — utilisé par les baux
  (Lease §4.13), les fenêtres de quota (§4.14), les verrous (§13.5).
- `isStale(lastSeenAt, ttlMs, now)` : une ressource jamais vue est stale par définition (`null` → `true`) ;
  sinon stale dès que l'âge atteint le TTL — utilisé par machines/sessions/commandes (§6.4, §17.7).

Chaque module définit **ses seuils** (constantes nommées type `MACHINE_STALE_TTL_MS`) et les passe à ces
fonctions — le kernel fournit l'arithmétique, jamais les valeurs.

### 4.9 Couche interface : `toHttpException`

Le seul endroit qui décide comment un échec de domaine devient un statut HTTP. Deux règles sont
universelles et ne se déclarent pas : toute erreur nommée `*NotFoundError` est un 404 (les sous-classes
d'`EntityNotFoundError` la respectent toutes), et une `InvalidStateTransitionError` est un 410 quand elle
quitte un état terminal, un 409 sinon. Le reste est un 400 sauf si le contrôleur le classe explicitement
(`conflicts`, `forbidden`, `notFound`) — le défaut reste donc honnête : non classé signifie « requête
invalide », jamais un 500 silencieux.

**Pourquoi au kernel** : cette convention était recopiée dans cinq contrôleurs et avait déjà divergé —
une erreur ajoutée à un module retombait en 400 ailleurs faute d'y être connue. Personne ne possédait la
règle ; maintenant si.

### 4.10 Couche application : `UseCase` et `flushDomainEvents`

- `UseCase<Input, Output>` : une classe = une opération, une seule méthode `execute`. L'interface existe
  pour l'uniformité (et les tests), pas pour du polymorphisme.
- `flushDomainEvents(aggregate, publisher)` : encode l'ordre obligatoire **persister → publier → vider** en
  une seule fonction. Un use-case appelle `repository.save(aggregate)` puis `flushDomainEvents(...)` —
  jamais `publishAll`/`clearDomainEvents` à la main, l'inversion accidentelle devient impossible.

### 4.11 Ports `Clock` et `EventPublisher`

- `Clock` : le domaine et l'application n'appellent **jamais** `new Date()` — ils reçoivent `CLOCK` par DI.
  Tous les calculs de staleness/TTL sont testables avec `FakeClock` (gelée, `set`/`advance` explicites).
- `EventPublisher` : implémentation par défaut sur `EventEmitter2` (joker activé dans `AppModule`), qui
  alimentera le relais temps réel et le futur Event Bus persistant (§14) sans changer les producteurs.

Les jetons DI sont des chaînes préfixées (`"kernel/Clock"`, `"kernel/EventPublisher"`) — lisibles dans les
erreurs Nest et sans collision entre modules.

### 4.12 `kernel.module.ts`

Module Nest `@Global()` : chaque module du hub résout `CLOCK` et `EVENT_PUBLISHER` sans les réimporter.
Les tests d'application les remplacent par les doubles de `testing/`.

## 5. Ce que le kernel impose aux modules suivants

1. **TDD strict** : specs écrites et rouges avant l'implémentation, pour chaque couche
   (domain → application → infrastructure → interface).
2. **Un `doc.md` par module** (cette convention) : conception détaillée, responsabilités, décisions, avant
   d'écrire le code du module.
3. **Échecs attendus en `Result`**, erreurs en sous-classes de `DomainError` ; les « introuvable » étendent
   `EntityNotFoundError`, les transitions refusées passent par `InvalidStateTransitionError`.
4. **Factories validantes** : constructeurs protégés, `create(...)` statique validant par `Guard` et
   retournant `Result`.
5. **Toute machine à états passe par `StateMachine`** — aucun module ne réimplémente sa propre logique de
   transition ; l'interface expose les affordances via `allowedFrom` (§20.6).
6. **Persistance de l'agrégat complet** (spec §5.19) : les repositories Prisma écrivent toujours l'objet
   entier, jamais une liste de champs choisie à la main — la classe de bug « sauvegarde partielle » est
   éliminée par convention, vérifiable en revue.
7. **Horloge injectée** : tout calcul temporel passe par `CLOCK` puis `staleness.ts` — jamais `new Date()`
   ni d'arithmétique de dates ad hoc. Les événements reçoivent `occurredAt` en argument (`BaseDomainEvent`).
8. **Événements après persistance** : `repository.save(aggregate)` puis
   `flushDomainEvents(aggregate, publisher)` — dans cet ordre, toujours, via le helper.
9. **Seuils nommés** : chaque TTL est une constante exportée et documentée du module concerné (§17.7),
   jamais un littéral enfoui.
10. **`workspaceId` obligatoire dans toute entrée de use-case qui charge un objet par identifiant**, et
    comparé au workspace de l'objet chargé. Voir §5.1 : c'est la règle la plus coûteuse à avoir enfreinte.

### 5.1 Isolation par workspace — la garde ne prouve pas ce qu'on croit

`PermissionsGuard` prouve que l'appelant est membre du workspace **nommé dans l'URL**. Il ne prouve
**rien** sur l'objet vers lequel pointe l'identifiant. Une route qui reçoit les deux et ne vérifie pas
qu'ils concordent rend le workspace de l'URL décoratif : n'importe quel membre de n'importe quel
workspace atteint tous les autres en collant un identifiant.

Ce n'était pas une hypothèse. Une passe dédiée a trouvé **six routes livrées** dans cet état :

| Route | Ce qui se passait réellement |
| --- | --- |
| `GET /event-receipts/mine` | aucun workspace **et aucune garde** : un seul flux mélangeant tous les workspaces de l'acteur, encore servi après révocation d'une appartenance |
| `POST …/events/:id/receipts` | exigeait un accusé sur un fait d'un autre workspace |
| `POST …/events/:id/receipts/mine` | acquittait un fait d'un autre workspace |
| `POST …/goals/:id/progress` | **écriture cross-workspace réussie, 200** — la seule du code |
| `PATCH …/members/:id` | changeait un rôle dans un autre workspace |
| `DELETE …/members/:id` | révoquait un membre d'un autre workspace |

Les deux dernières ne renvoyaient pas 200 : elles butaient sur « on ne retire pas le dernier
propriétaire ». Refusées par accident, pas par isolation — avec un second propriétaire en face, elles
passaient.

**Cause commune, et c'est elle qu'il fallait traiter :** `workspaceId` était déclaré `workspaceId?:
string` dans dix-neuf use-cases, avec un commentaire du genre « quand il est fourni, un objet d'un autre
workspace est rapporté absent ». L'isolation était donc **optionnelle** — un appelant qui l'omet la
supprime en silence, sans erreur de compilation, sans test rouge. C'est exactement ce qui est arrivé
trois fois. Le champ est désormais **obligatoire partout** : l'oublier ne compile plus.

Deux règles qui en découlent :

- **« pas à vous » se répond `404`, jamais `403`.** Un 403 confirme que l'objet existe ; l'appelant
  apprend quelque chose sur un workspace auquel il n'a pas accès.
- **`test/workspace-isolation.e2e-spec.ts` est exhaustif, pas illustratif.** Il apparie le préfixe d'un
  workspace avec les identifiants d'un autre sur **chaque** route, avec un propriétaire des deux côtés —
  ainsi un refus ne peut venir que du scoping, jamais d'une permission manquante. Toute nouvelle route y
  entre. Le test se garde aussi contre lui-même : un identifiant `undefined` produirait un 404 qui ne
  prouve rien et se lirait comme un succès — c'est arrivé pendant l'écriture, et une assertion sur le
  gréement le rend impossible.

### 5.2 Une chaîne de réactions est bornée

`ReactionDepth` (§4) plafonne à **5** la profondeur d'une cascade de réactions, comme OpenClaw plafonne
les échanges entre agents (`maxPingPongTurns`, défaut 5 — spec §10.18).

Ce n'était pas nécessaire tant que la publication était en « fire-and-forget » : un écouteur qui publiait
ce qu'il écoutait fuyait des promesses flottantes. Depuis que la publication est **attendue** (pour que
l'appelant ne soit pas informé avant que le travail soit fait), la même erreur **récurse sur la pile de
l'appelant** et la requête ne revient jamais. Aucun écouteur ne fait ça aujourd'hui ; l'intérêt est
qu'aucun ne puisse commencer à le faire en silence, et qu'un cycle soit refusé **en nommant la chaîne**
plutôt qu'en débordant la pile.

Les chaînes légitimes sont courtes : un objectif annulé → ses tâches annulées → leurs assignés prévenus,
soit trois. Au-delà de cinq, ce n'est pas du travail en profondeur, c'est un cycle.

### 5.3 Une promesse que personne n'attend est une erreur de lint, pas une habitude de revue

Quand `EventPublisher` est devenu asynchrone, le compilateur n'a signalé que les sites **dont la valeur
de retour était utilisée**. **Trente-quatre** appels à `flushDomainEvents` ont continué de compiler en
promesses ignorées : les faits étaient écrits *après* le retour de la requête. En test, cela se
manifestait par des violations de clé étrangère contre des lignes qu'un test suivant avait déjà purgées —
donc par des échecs erratiques attribuables à tout sauf à leur cause. En production, ce sont des rejets
non gérés et un appelant informé avant que le travail soit fait.

Le lint du hub est donc **typé** (`projectService`) pour deux règles : `no-floating-promises` et
`await-thenable`. Le commentaire du §7 disait que le critère de réussite du changement de port était
« que le changement soit trouvé par le compilateur et non par la production ». Il l'a été à moitié :
le compilateur ne pouvait pas voir cette moitié-là.

### 5.4 Audit transversal des quatorze modules — ce qu'il a trouvé

Fait après le module memory, sur l'ensemble livré : inventaire des 80 routes avec leurs permissions,
graphe de dépendances entre modules, ports d'inversion, granularité CRUD, bornes de lecture.

**Ce qui allait bien, et qui vaut d'être dit parce que c'était le but** : aucun cycle entre modules ;
chaque port d'inversion est déclaré par le consommateur et fourni par le fournisseur, sans exception ;
chaque module a son `doc.md` ; l'isolation par workspace tient partout depuis la correction dédiée.

**Trois défauts réels, et le point commun est instructif** : aucun n'était visible depuis un module pris
isolément. Ils n'apparaissent qu'en regardant l'ensemble.

1. **Deux rôles nommés « lecture seule » pouvaient écrire.** `POST /memory`, `POST /memory/:id/forget` et
   `POST /notifications` étaient gardés par `read_workspace_state` — donc un `VIEWER` et un
   `READ_ONLY_AGENT` écrivaient dans la mémoire d'un workspace et diffusaient des messages à tous. Le
   test de la matrice ne pouvait pas le voir : la matrice était juste, la faute était **sur les routes**.
   Une permission `contribute_knowledge` a été ajoutée, accordée partout où `record_decisions` l'est —
   noter ce qu'on a appris et le rapporter sont la même catégorie d'acte que consigner son raisonnement —
   et refusée au seul `VIEWER`.

2. **Sept agrégats rendaient des identifiants que l'API ne savait pas résoudre.** `MissingProofError`
   nomme des validations, `/policies/effective` nomme la politique qui a décidé, `/audit/verify` nomme
   l'entrée où la chaîne se rompt, une entrée de mémoire nomme celle qui l'a remplacée — et aucun de ces
   identifiants n'avait de route de lecture. Le critère retenu, vérifiable : **un identifiant que l'API
   rend doit être résolvable par l'API**. Sept routes `GET /:id` ajoutées.

3. **Onze listes renvoyaient une table entière.** La convention de plafonnement existait dans trois
   modules et manquait dans huit. Invisible tant que les tables sont petites, mur ensuite, et un appelant
   ne peut même pas savoir qu'il reçoit plus qu'il n'a demandé. `pagination.ts` est monté au kernel — onze
   modules en dépendent, aucune connaissance métier — et l'absence de limite vaut désormais une page.

**Trois invariants structurels ajoutés**, parce qu'un correctif ponctuel ne protège que le passé :

| Invariant | Ce qu'il rend impossible |
| --- | --- |
| `write-permissions.spec.ts` | qu'une route POST/PATCH/DELETE repose sur une permission de lecture |
| `bounded-queries.spec.ts` | qu'un `findMany` reparte sans borne |
| `route-shadowing.spec.ts` | qu'une route paramétrique déclarée trop tôt avale une route statique |

Les trois portent une **liste d'exceptions nommées avec leur raison**, jamais une désactivation générale —
la forme que §18.8 demande explicitement. Chacun vérifie aussi qu'il trouve bien quelque chose à
inspecter : un glob cassé ferait passer la suite en n'examinant rien, ce qui se lit exactement comme un
succès.

Le troisième n'était pas une hypothèse : ajouter `GET /:entryId` au contrôleur d'audit a fait passer
`GET /audit/verify` en 404, et une seule assertion e2e l'a remarqué.

### 5.5 Le défaut qui apparaît quand un module en débloque un autre

Trois modules ont été livrés en disant, à juste titre, « X n'existe pas encore ». Puis X a été livré, et
**la phrase est restée**. Un audit transversal en a trouvé un cas net — `scheduling` expliquait que
l'assignation manquait « parce qu'il n'y a pas de Worker », alors que le module runtime venait de les
créer — et un cas de contradiction interne, où le tableau d'un doc revendiquait ce que sa propre section
de reports déclarait différé.

Ce n'est pas de la cosmétique : ces phrases sont la seule explication qu'un lecteur a de **pourquoi**
quelque chose manque, et une explication périmée envoie chercher au mauvais endroit. La règle qui en
découle :

> **Livrer un module, c'est aussi relire ce que les autres disaient de son absence.** Un report nommé est
> une dette ; quand la dette est payée, la ligne qui la nommait doit changer dans le même mouvement.

Les invariants structurels (§5.1 à §5.3) attrapent les régressions de code. Celui-ci ne peut pas être
automatisé — une phrase périmée compile parfaitement — donc il est écrit ici, et l'audit d'intégration
qui suit chaque module est l'endroit où on le vérifie.

### 5.6 Revue de sécurité — l'identifiant dans l'URL n'est pas une preuve d'identité

Revue menée sur le hub et le worker après le module runtime. Ce qui tenait déjà : bcrypt sur tous les
secrets, comparaison HMAC en temps constant pour la chaîne d'audit, message de login identique pour un
compte inconnu et un mot de passe faux (pas d'énumération de comptes), une seule requête SQL brute et
elle est paramétrée, aucun secret dans les événements de domaine, une seule route sans garde et c'est
`/health`.

**Le défaut sérieux, et il n'était visible qu'en lisant une route et son contrat d'authentification
ensemble.** Les routes d'une machine portent son identifiant dans le chemin — `POST
/runtime/workers/:workerId/commands/claim` — et la seule garde était « être authentifié ». Rien ne liait
`:workerId` à l'appelant. N'importe quel acteur authentifié, y compris le rôle le plus faible d'un
workspace, pouvait donc **réclamer les ordres adressés à la machine d'un autre** : il en recevait les
charges utiles, et la vraie machine ne trouvait plus rien à prendre, les ordres étant déjà `CLAIMED`.
Le même trou existait à l'enregistrement, qui fait un upsert par nom d'hôte : annoncer le nom d'hôte
d'une machine existante rendait son identifiant — une reprise d'identité en un appel.

La règle qui en découle, et qui vaut au-delà du runtime :

> **Un identifiant dans un chemin est une donnée fournie par l'appelant, jamais une preuve.** Toute
> ressource qui a un propriétaire doit le porter en base et le vérifier à chaque acte, même quand la
> route « appartient » manifestement à cette ressource.

`WorkerNode` porte désormais `registeredBy: ActorRef`, et `isOperatedBy()` est appelé avant tout acte de
machine (battement, réclamation, rapport, ré-enregistrement). Refus en **403, pas 404** : la machine
existe, et répondre « introuvable » enverrait un opérateur déboguer une machine qui va bien (§20.6).

**Quatre durcissements HTTP, tous absents et tous hors module.** `enableCors()` sans argument autorisait
toutes les origines ; aucun en-tête de sécurité ; aucune limite de débit sur `/auth/login`, alors que
bcrypt rend chaque tentative bon marché pour l'attaquant et coûteuse pour nous ; aucun plafond de taille
de corps, alors qu'un `payload` de politique ou de commande accepte du JSON arbitraire par conception.

Le point méthodologique compte plus que la liste : **ces quatre protections vivaient dans `main.ts`, que
`moduleRef.createNestApplication()` n'exécute jamais**. Une protection écrite là est une protection
qu'aucun test e2e ne peut observer — et un contrôle de sécurité que personne ne vérifie est un contrôle
de sécurité que personne n'a. Elles sont donc extraites dans `configureApp()`, appelée par `main.ts`
**et** par `test/security.e2e-spec.ts`, qui les prouve une par une.

Enfin, côté worker : le jeton porteur partait vers l'URL configurée quelle qu'elle soit, `http://` compris.
`HUB_URL` exige désormais `https`, sauf loopback où rien ne quitte la machine.

**Un invariant structurel ajouté** : `authenticated-routes.spec.ts` — aucun contrôleur sans garde, liste
d'exceptions nommée (`/health` seul). L'omission d'une garde ne se remarque pas en revue : elle ressemble
à rien.

### 5.7 Le catalogue OpenClaw, passé sur notre code

Second tour de revue, mené non plus par inspection mais **contre une liste réelle** : les vulnérabilités
publiées d'OpenClaw (138 CVE en cinq mois, plus l'analyse de leur bac à sable par Snyk et deux papiers
académiques). Chaque classe a été cherchée chez nous. C'est un exercice différent du premier : on ne
cherche plus ce qui a l'air faux, on cherche **ce qui a déjà été exploité ailleurs**.

**La plus grave, et elle était une ligne.** `POST /workspaces/:id/runtime/commands` exigeait
`execute_tasks` — que détient un `AGENT_CONTRIBUTOR`. Un agent pouvait donc mettre un ordre arbitraire,
avec une charge utile arbitraire, sur la file d'une machine que l'opérateur possède. C'est la chaîne
d'injection indirecte complète, dans une seule permission : fichier empoisonné → agent qui le lit → ordre
enfilé → exécution sur l'hôte. L'agent n'avait pas besoin d'être malveillant, seulement de lire.

La règle est maintenant §18.12 de la spec, et elle ne se négocie pas : **aucun rôle d'agent ne détient une
permission qui aboutit à l'exécution sur une machine**. Quand le Task Engine devra enfiler pour le compte
d'un agent, il le fera *en tant que hub*, depuis une décision qu'il a prise.

**Trois autres, même famille que des CVE nommées :**

| Chez OpenClaw | Chez nous |
| --- | --- |
| CVE-2026-44118 : un drapeau `senderIsOwner` fourni par le client servait d'autorisation | `agentType`/`agentId` venaient du corps de requête et étaient crus — n'importe quel membre pouvait ouvrir une session attribuée à un agent d'un autre workspace. Appartenance vérifiée. |
| 40 000 instances exposées, bind par défaut sur toutes les interfaces | `app.listen(port)` faisait pareil. Loopback par défaut, `LISTEN_HOST` pour en sortir délibérément. |
| CVE-2026-25253 : un client suivait une URL qu'on lui donnait et y envoyait son jeton | Le worker suivait les redirections avec son en-tête `Authorization`. `redirect: "error"`. |

**Et le worker, où le trou était conceptuel plutôt que ponctuel.** Le lancement était sûr — pas de shell,
arguments en liste, environnement construit à partir de rien. Ce qui manquait, ce sont les évasions qui
n'ont pas besoin de shell :

- **Les variables de chargement de code.** `LD_PRELOAD`, `NODE_OPTIONS=--require`, `BASH_ENV`,
  `GIT_SSH_COMMAND` : le programme autorisé s'exécute, et charge le code de l'attaquant. Une liste blanche
  de programmes sans cette fermeture-là est décorative. (Classe CVE-2026-44115.)
- **`PATH` écrasable par la tâche** : la liste blanche autorisait `git`, et autre chose s'exécutait.
- **Le confinement calculé sur le chemin écrit.** `path.resolve` est de l'arithmétique de chaînes : un
  répertoire dans le workspace qui est un lien symbolique vers `/` passait. C'est la classe
  CVE-2026-44112/44113, et **le taux de défense le plus faible mesuré chez eux (17 %)**.
- **Aucune liste blanche du tout, aucun délai, aucun plafond de sortie, aucun refus de tourner en root.**

La leçon générale, écrite dans le README du worker et en §18.5-18.6 :

> **Un processus ne peut pas se confiner lui-même.** Tout ce qu'un worker applique sans le noyau est de la
> défense en profondeur, pas une frontière. La course TOCTOU, le réseau, le reste du disque et les
> ressources restent ouverts — et une liste de refus énumère le connu, ce qu'une frontière ne fait pas.

Le dire est un contrôle en soi : lue comme un bac à sable, cette liste promettrait ce qu'elle ne tient pas.

## 6. Décisions notables (et leurs raisons)

| Décision | Raison |
| --- | --- |
| `StateMachine` ne mute rien — elle arbitre, l'entité mute | L'entité reste seule propriétaire de son état ; la machine est pure, triviale à tester exhaustivement. |
| États terminaux dérivés (liste sortante vide), pas déclarés | Une déclaration séparée peut se désynchroniser de la table ; la dérivation rend l'incohérence impossible. |
| Cycle rejeté à l'insertion dans `DependencyGraph` | Découvrir un cycle au moment de scheduler est trop tard : l'état invalide est déjà persisté. Échec immédiat, localisé, typé. |
| Constructeur d'`Entity` protégé | Force les factories statiques validantes (`create() → Result`) ; l'entité invalide est inreprésentable. |
| `ValueObject.equals` exige le même type concret | Deux concepts métier distincts aux props identiques ne sont pas interchangeables ; l'égalité purement structurelle inter-types serait un piège. |
| `BaseDomainEvent` sans défaut `new Date()` | La règle « horloge injectée » doit être inviolable par construction, pas par discipline — un défaut serait le trou par lequel elle fuit. |
| `occurredAt` copié à la construction | Un événement est un fait ; muter la `Date` d'origine après coup ne doit pas pouvoir réécrire l'histoire. |
| `Guard.againstEmpty` retourne la valeur trimée | La normalisation appartient à la frontière de validation, pas à chaque site d'appel — un seul endroit décide de ce que « vide » veut dire. |
| `isExpired` inclusif (`>=`) | Une échéance atteinte est une échéance passée ; l'ambiguïté « pile à l'instant T » est tranchée une fois pour toutes, testée, et plus jamais rediscutée. |
| `isStale(null) === true` | Une ressource qui n'a jamais donné signe de vie ne doit jamais passer pour fraîche — le doute joue contre la disponibilité, pas pour. |
| `flushDomainEvents` comme fonction, pas comme méthode de repository | L'ordre persister→publier→vider est un invariant applicatif, pas une responsabilité de persistance ; le helper le rend impossible à inverser sans le contourner visiblement. |
| `domainEvents` retourne une copie | Un instantané pris avant `clearDomainEvents()` reste exploitable ; personne ne peut muter la collection interne. |
| Jetons DI en chaînes préfixées plutôt que `Symbol` | Lisibles dans les messages d'erreur Nest (« kernel/Clock » vs `Symbol()`), et stables entre rechargements en watch mode. |
| Pas de pagination/DTO au kernel | Conventions de la couche interface — elles se décident au premier contrôleur, avec un vrai cas sous les yeux, pas en avance de phase. |
| Pas de base `Repository<T>` générique | Chaque port de repository nomme ses requêtes métier (`findActiveByWorkspace`…) ; une base générique save/findById pousserait vers l'anémie. |

## 7. Évolutions prévues

- ~~**Event Bus persistant (§14)**~~ : **livré** par le module event. Deux corrections que cette section
  avait prédites à tort, et qui valent d'être gardées :
  - elle affirmait « **le port ne change pas** — c'est le critère de réussite de son design ». Faux :
    persister est une E/S, et une signature `void` ne peut l'honorer qu'en jetant les erreurs. Le port est
    devenu `Promise<void>`. Le critère de réussite n'était pas le bon — ce n'est pas « le port ne change
    pas », c'est « le changement est trouvé par le compilateur et non par la production ». Il l'a été :
    six sites.
  - `DomainEvent` a dû déclarer `workspaceId` (nullable — certains faits sont au-dessus des workspaces),
    parce que §4.20 l'exige de tout Event. Il n'était porté que par 9 des 33 classes d'événements, ajouté
    au coup par coup là où un listener en avait eu besoin.
  La dette de durabilité est donc close à hauteur de ce qui est vrai : écriture avant émission. Reste
  l'atomicité avec l'écriture de l'agrégat, nommée dans `modules/event/doc.md` §1.7.
- **`Lease` (§4.13)** : le bail est une entité à part entière (owner, resource, expires_at, renew) — elle
  vivra dans le module qui la possède (Lock Manager ou Runtime), construite sur `isExpired` du kernel.
  Elle n'entre pas au kernel : elle a une identité et un propriétaire, ce n'est pas une primitive.
- **Concurrence optimiste** : si un module en a besoin (agrégats à forte contention), un champ `version`
  s'ajoutera à `AggregateRoot` et la convention de persistance §5.19 s'étendra — rien dans le design actuel
  ne s'y oppose.
