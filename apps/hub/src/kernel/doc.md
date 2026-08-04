# Kernel — Conception détaillée

> Module : `apps/hub/src/kernel/`
> Référence spec : `v3/spline-v3.md` — §1.3 (principes), §4.24 (invariants globaux), §9.5 (DAG), §22.6 (machines à états)
> Statut : implémenté, 43 tests unitaires verts.

## 1. Rôle

Le kernel est le socle partagé de tous les modules métier du hub. Il fournit les primitives de domaine
(identité, agrégats, résultats, événements), les règles transversales imposées par la spec v3 (machines à
états idempotentes, graphe de dépendances acyclique), et les deux ports d'infrastructure que tout le reste du
système consomme (horloge, publication d'événements).

Il ne contient **aucune logique métier** : pas d'entité Spline (Workspace, Task, Agent…), pas de règle produit.
Tout ce qui s'y trouve doit être vrai pour n'importe quel module, présent ou futur — y compris un Engine
communautaire (spec §19) qui suivrait les mêmes conventions.

## 2. Responsabilités / Non-responsabilités

**Responsable de :**

- La convention de retour des échecs attendus (`Result<T, E>`) — jamais d'exception pour un échec métier.
- L'identité et l'égalité des entités (`UniqueEntityId`, `Entity`).
- La collecte des événements de domaine par les agrégats (`AggregateRoot`, `DomainEvent`).
- La règle transversale §22.6 sur les transitions d'état (`StateMachine`) — utilisée par toute machine à
  états du système, sans exception.
- Le graphe de dépendances acyclique (`DependencyGraph`) qui servira au Scheduler (§9.5) et à toute autre
  relation de dépendance (validations en graphe §11.9, dépendances de Goals).
- Les ports `Clock` et `EventPublisher`, leurs implémentations par défaut, et leurs doubles de test.

**Jamais responsable de :**

- Persistance (aucun import Prisma ici).
- Transport (aucun import HTTP/WebSocket).
- Logique métier d'un module (un module qui aurait besoin de « personnaliser » une primitive du kernel doit
  composer, pas modifier le kernel).

## 3. Structure

```text
kernel/
├── domain/               # primitives pures, zéro dépendance framework (sauf node:crypto)
│   ├── result.ts             Result<T, E>
│   ├── domain-error.ts       DomainError (base des erreurs métier)
│   ├── unique-entity-id.ts   UniqueEntityId
│   ├── entity.ts             Entity<Props>
│   ├── aggregate-root.ts     AggregateRoot<Props>
│   ├── domain-event.ts       DomainEvent (interface)
│   ├── state-machine.ts      StateMachine<S> + TransitionOutcome<S>   (§22.6)
│   ├── dependency-graph.ts   DependencyGraph + DependencyCycleError   (§9.5)
│   └── ports/
│       ├── clock.port.ts             Clock + jeton CLOCK
│       └── event-publisher.port.ts   EventPublisher + jeton EVENT_PUBLISHER
├── infrastructure/       # implémentations par défaut (peuvent importer Nest)
│   ├── system-clock.ts                   Clock → new Date()
│   └── event-emitter-event-publisher.ts  EventPublisher → EventEmitter2
├── testing/              # doubles pour les tests des autres modules
│   ├── fake-clock.ts             horloge gelée, avance explicite
│   └── fake-event-publisher.ts   capture les événements publiés
└── kernel.module.ts      # module Nest @Global : bind CLOCK et EVENT_PUBLISHER
```

La règle de dépendance est stricte : `domain/` n'importe rien en dehors de lui-même (exception assumée :
`node:crypto` pour générer les UUID). `infrastructure/` importe `domain/` et le framework. `testing/`
importe `domain/` uniquement.

## 4. Composants

### 4.1 `Result<T, E>`

Tout échec **attendu** (violation d'invariant, transition refusée, conflit) circule dans un `Result`, jamais
dans une exception. Les exceptions restent réservées aux erreurs de programmation (lire `.value` d'un échec
lève, volontairement, pour attraper les bugs au plus tôt).

API : `Result.ok(value)`, `Result.fail(error)`, `isSuccess` / `isFailure`, `value` / `error`,
`Result.combine([...])` (premier échec gagne), `map(fn)`.

Convention de consommation dans les use-cases :

```ts
const result = aggregate.doSomething(input);
if (result.isFailure) return Result.fail(result.error);
```

### 4.2 `DomainError`

Base de toutes les erreurs métier. Fixe `name` au nom de la classe concrète pour que les erreurs restent
identifiables après sérialisation/log. Chaque module déclare ses erreurs dans `domain/<module>.errors.ts`
en étendant cette base — jamais de `throw new Error("...")` dans le domaine.

### 4.3 `UniqueEntityId`, `Entity<Props>`, `AggregateRoot<Props>`

- `UniqueEntityId` : UUID généré si absent, égalité par valeur.
- `Entity` : égalité **par identité** (deux entités sont la même ssi leurs ids sont égaux, quelles que
  soient leurs propriétés). Constructeur `protected` : les entités concrètes s'instancient par des factories
  statiques (`Workspace.create(...)`) qui valident les invariants et retournent un `Result`.
- `AggregateRoot` : ajoute la collecte d'événements de domaine. `addDomainEvent` est `protected` (seul le
  comportement de l'agrégat peut lever un événement) ; `domainEvents` retourne une copie (le vidage ultérieur
  n'affecte pas un instantané déjà pris) ; `clearDomainEvents` est appelé par la couche application **après
  persistance réussie** — un événement ne part jamais avant que l'état qui le justifie soit durable.

### 4.4 `DomainEvent`

Un fait accompli, jamais une intention (spec §4.20). `eventName` en segments pointés
(`workspace.created`, `task.status_changed`) pour permettre les abonnements par joker (`workspace.*`, `**`)
côté relais temps réel. Porte `occurredAt` et `aggregateId`. Les événements sont des classes simples dans
`domain/<module>-events.ts`, sans dépendance framework.

### 4.5 `StateMachine<S>` — règle transversale §22.6

**C'est l'ajout structurant de la v3**, né d'un bug réel (arrêt d'une session déjà arrêtée → 500). Toute
machine à états du système (Task, Session, Worker, Validation, Lock, Extension…) déclare sa table de
transitions et la fait arbitrer par cette classe :

- transition vers l'état courant → `{ kind: "alreadyInState" }` : **no-op réussi**, jamais une erreur ;
- transition non déclarée → `{ kind: "invalidTransition", fromTerminal }` : résultat typé, le drapeau
  `fromTerminal` distingue « impossible depuis un état terminal » (l'appelant peut répondre 409/410 propre)
  de « transition simplement interdite » ;
- transition déclarée → `{ kind: "transitioned" }`.

**Rien ne lève jamais.** Un état est terminal ssi sa liste de transitions sortantes est vide — c'est dérivé
de la table, pas déclaré à part (impossible de désynchroniser les deux).

Usage type dans une entité :

```ts
private static readonly machine = new StateMachine<TaskState>({ ... });

changeStatus(next: TaskState): Result<void, TaskTransitionError> {
  const outcome = Task.machine.transition(this.props.state, next);
  switch (outcome.kind) {
    case "alreadyInState": return Result.ok(undefined);      // idempotent
    case "invalidTransition": return Result.fail(new TaskTransitionError(outcome));
    case "transitioned": /* muter + addDomainEvent */ return Result.ok(undefined);
  }
}
```

### 4.6 `DependencyGraph` — §9.5

DAG à insertion contrôlée : `addDependency(node, dependsOn)` **rejette le cycle au moment de l'insertion**
(`DependencyCycleError` dans un `Result`), jamais découvert plus tard pendant l'ordonnancement. Auto-dépendance
rejetée. Les nœuds inconnus sont enregistrés implicitement.

- `readyNodes(completed)` : fonction pure de l'ensemble des nœuds accomplis → nœuds exécutables maintenant.
  C'est la primitive du Scheduler (« une tâche devient exécutable lorsque toutes ses dépendances sont
  satisfaites »).
- `topologicalOrder()` : dépendances avant dépendants, ordre d'insertion préservé à égalité (déterminisme).
- `dependenciesOf(node)` : dépendances directes uniquement.

### 4.7 Ports `Clock` et `EventPublisher`

- `Clock` : le domaine et l'application n'appellent **jamais** `new Date()` — ils reçoivent `CLOCK` par DI.
  Motivation vécue : tous les calculs de staleness/TTL (spec §17.7) doivent être testables avec une horloge
  gelée (`FakeClock`), sinon les tests de péremption sont non déterministes.
- `EventPublisher` : la couche application publie les `domainEvents` d'un agrégat **après** persistance,
  puis les vide. L'implémentation par défaut émet dans `EventEmitter2` (joker activé dans `AppModule`), ce
  qui alimentera le relais temps réel et le futur Event Bus persistant (§14) sans changer les producteurs.

Les jetons DI sont des chaînes préfixées (`"kernel/Clock"`) pour éviter toute collision entre modules.

### 4.8 `kernel.module.ts`

Module Nest `@Global()` : chaque module du hub résout `CLOCK` et `EVENT_PUBLISHER` sans les réimporter.
Les tests d'application les remplacent par les doubles de `testing/`.

## 5. Ce que le kernel impose aux modules suivants

1. **TDD strict** : specs écrites et rouges avant l'implémentation, pour chaque couche
   (domain → application → infrastructure → interface).
2. **Un `doc.md` par module** (cette convention) : conception détaillée, responsabilités, décisions, avant
   d'écrire le code du module.
3. **Échecs attendus en `Result`**, erreurs en sous-classes de `DomainError`.
4. **Toute machine à états passe par `StateMachine`** — aucun module ne réimplémente sa propre logique de
   transition (c'est l'application concrète de l'invariant §22.6 « règle transversale »).
5. **Persistance de l'agrégat complet** (spec §5.19) : les repositories Prisma écriront toujours l'objet
   entier, jamais une liste de champs choisie à la main — la classe de bug « sauvegarde partielle » est
   éliminée par convention, vérifiable en revue.
6. **Horloge injectée** : tout calcul temporel (péremption, TTL, checkpoint) prend `CLOCK`, jamais
   `new Date()` en dur.
7. **Événements après persistance** : `repository.save(aggregate)` puis `publisher.publishAll(...)` puis
   `aggregate.clearDomainEvents()` — dans cet ordre, toujours.

## 6. Décisions notables (et leurs raisons)

| Décision | Raison |
| --- | --- |
| `StateMachine` ne mute rien — elle arbitre, l'entité mute | L'entité reste seule propriétaire de son état ; la machine est pure, triviale à tester exhaustivement. |
| États terminaux dérivés (liste sortante vide), pas déclarés | Une déclaration séparée peut se désynchroniser de la table ; la dérivation rend l'incohérence impossible. |
| Cycle rejeté à l'insertion dans `DependencyGraph` | Découvrir un cycle au moment de scheduler est trop tard : l'état invalide est déjà persisté. Échec immédiat, localisé, typé. |
| Constructeur d'`Entity` protégé | Force les factories statiques validantes (`create() → Result`) ; l'entité invalide est inreprésentable. |
| `domainEvents` retourne une copie | Un instantané pris avant `clearDomainEvents()` reste exploitable ; personne ne peut muter la collection interne. |
| Jetons DI en chaînes préfixées plutôt que `Symbol` | Lisibles dans les messages d'erreur Nest (« kernel/Clock » vs `Symbol()`), et stables entre rechargements en watch mode. |

## 7. Évolutions prévues

- **Event Bus persistant (§14)** : `EventPublisher` gagnera une implémentation qui persiste avant d'émettre
  (outbox). Le port ne change pas — c'est le critère de réussite de son design.
- **`Lease` (§4.13)** : la primitive de bail (acquisition, renouvellement, expiration par `Clock`) entrera
  probablement au kernel quand Locks et Scheduler en auront tous deux besoin ; pas avant (règle : rien
  n'entre au kernel sans deux consommateurs).
