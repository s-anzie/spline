# Event — Conception détaillée

> Module : `apps/hub/src/modules/event/`
> Référence spec : `v3/spline-v3.md` — §4.20 (Event), §4.21 (EventReceipt), §14 (Event Bus),
> §16.10 (la mémoire se reconstruit à partir des Events), §18.7 (audit), §17.9 (alertes)
> Statut : implémenté, double-vérifié (§6), audité en accessibilité.

## 1. Intégration — ce que ce module doit à l'écosystème et ce qu'il lui rend

*C'est le module le plus structurant construit jusqu'ici : il ne s'ajoute pas à côté des autres, il change
la façon dont **tous** publient. L'analyse a produit deux constats qui invalident des affirmations
antérieures — ils sont en §1.5.*

### 1.1 Ce qu'Event est dans le système

**Le système nerveux** (§14) : « tous les composants communiquent uniquement au travers d'événements ».
Un Event est un **fait accompli**, jamais une intention — la distinction est dans la spec et elle est
opérante : on n'annule pas un événement, on en publie un autre.

Trois usages distincts, qu'il faut ne pas confondre :

1. **Réaction** — un module agit quand un autre a fait quelque chose (déjà en place : l'annulation en
   cascade des tâches).
2. **Journal** — la trace ordonnée et durable de ce qui s'est passé (§14.1, §14.5, §16.10).
3. **Accusé de réception** — savoir qu'un acteur a *pris connaissance* d'un fait (§4.21, §14.4).

Le troisième est porté par une **entité séparée** : « un Event n'a pas de champ de lecture propre »
(§4.20). C'est une leçon v1 explicitement restaurée dans la v3, et elle est structurante : un fait est
partagé, sa prise de connaissance est individuelle.

### 1.2 Ce qu'il change pour les modules existants

Aujourd'hui, `flushDomainEvents(aggregate, publisher)` émet dans un `EventEmitter2` **en mémoire**. Les
faits disparaissent au redémarrage, et une réaction perdue l'est définitivement — dette nommée dans les
docs du kernel et de task.

Ce module la ferme en **remplaçant l'implémentation du port**, pas les appelants : tout module continue
d'appeler `flushDomainEvents`. Ce qui change, et c'est un vrai changement de contrat, est en §1.5.

| Module | Ce qu'il y gagne | Ce qu'il doit faire |
| --- | --- | --- |
| tous | ses faits deviennent durables, ordonnés, rejouables | `await` la publication (§1.5) |
| task | sa réaction à l'annulation d'un objectif cesse d'être « au mieux » sur le chemin nominal | rien |
| identity, workspace, goal, artifact, decision | un journal interrogeable de leur activité | rien |

### 1.3 Ce que les modules à venir en attendront

| Module futur | Attente | Conséquence dès maintenant |
| --- | --- | --- |
| **Notification** (§4.18-4.19) | être déclenchée par des faits, et **ne pas être confondue avec eux** | Event = fait diffusé ; Notification = message adressé avec destinataires résolus. Deux entités, deux tables. Le champ `severity` sert à décider ce qui mérite une alerte (§17.9) |
| **Audit** (§4.23, §18.7) | `actor`, `target`, horodatage, immuabilité | Event porte les trois et n'a **aucun chemin de modification** ; AuditEntry restera distinct (il porte `before`/`after`, qu'un fait ne porte pas) |
| **Memory System** (§16.10) | « toute mémoire peut être reconstruite à partir des … Events … » | d'où l'ordre total et la relecture par workspace |
| **Realtime** (§20.5) | relayer les faits aux clients connectés | l'émission en processus reste après persistance, le relais s'y abonne sans rien savoir du stockage |
| **Worker/Runtime** (§6.8 `PublishEvent`) | qu'une machine publie ses faits | un use-case d'enregistrement explicite, pas seulement la projection d'événements de domaine |
| **Scheduler** (§9.15) | publier ses propres faits | idem |

### 1.4 Ce qu'il ne fait pas

- **Il ne rejoue pas en ré-émettant.** §14.3 : « chaque événement est publié une seule fois ». Le replay
  (§14.5) sert la reprise, le débogage, la reconstruction et l'audit — ce sont des **lectures**. Ré-émettre
  déclencherait une seconde fois des réactions déjà exécutées.
- **Il ne remplace pas Notification.** Un fait n'a pas de destinataire ; un message si.
- **Il ne versionne pas encore les schémas d'événement.** §14.1 dit « versionnés » ; tant qu'aucun
  consommateur externe ne lit ces charges utiles, inventer un versionnement serait une abstraction sans
  utilisateur. Nommé en §6.

### 1.5 Deux constats qui invalident des affirmations antérieures

**a) Le port `EventPublisher` doit devenir asynchrone.** Le doc du kernel affirmait : « `EventPublisher`
gagnera une implémentation qui persiste avant d'émettre (outbox). **Le port ne change pas** — c'est le
critère de réussite de son design. » C'est faux, et l'analyse l'a montré avant l'implémentation :
persister est une opération d'E/S. Une signature `publish(): void` ne peut l'honorer qu'en jetant les
erreurs par-dessus bord — un fait perdu, silencieusement, est exactement ce que ce module doit empêcher.
Le port devient `Promise<void>`, `flushDomainEvents` devient `await`able, et le compilateur trouve les
appelants. Le critère de réussite n'était pas le bon.

**b) `workspaceId` n'est porté que par 9 des 33 classes d'événements.** Je l'avais ajouté à
`GoalStatusChanged` au coup par coup, le jour où un listener en a eu besoin — un correctif local là où il
fallait une règle. §4.20 exige `workspace_id` sur tout Event : sans lui, un journal n'est pas filtrable
par workspace, ce qui casse à la fois l'isolation (§4.2) et la Workspace Memory (§16.3).

Il devient donc une propriété **déclarée du contrat `DomainEvent`** — mais **nullable**, et c'est un choix
et non un renoncement : certains faits sont au-dessus des workspaces (`identity.user_registered`,
`identity.organization_created`, et demain `extension.published`, §19.4). Les forcer dans un workspace
serait un mensonge de plus.

### 1.6 Décisions que cette analyse impose

1. **Port asynchrone** (§1.5a).
2. **`workspaceId` nullable dans `DomainEvent`** (§1.5b), et chaque événement existant le fournit.
3. **Projection plutôt que retrofit** : `targetType` se déduit du préfixe du nom (`task.status_changed`
   → `task`), `targetId` est l'`aggregateId`. Aucun événement n'a besoin d'être réécrit pour ça.
4. **`severity` par convention**, pas par déclaration sur chaque événement : une table centrale associe
   un motif de nom à une gravité, `INFO` par défaut. C'est ce que Notification et les alertes (§17.9)
   consommeront.
5. **Ordre total par séquence monotone** (§14.1, §14.6), pas par horodatage : deux faits d'une même
   milliseconde doivent rester ordonnés.

### 1.7 L'atomicité — la limite qui a été fermée

**Ce que cette section disait, et qui n'est plus vrai** : la persistance avait lieu après l'écriture de
l'agrégat, dans sa propre transaction, si bien qu'un processus mourant entre les deux gardait le
changement et perdait le fait.

C'est fermé. Une transaction entoure désormais toute requête mutante (`TransactionInterceptor`), et
`PrismaService` route chaque délégué de modèle vers la transaction ambiante — donc le dépôt d'événements
la rejoint sans savoir qu'elle existe. Ce qu'il faut retenir tient en trois points.

**1. Le routage est au client, pas dans les soixante appelants.** L'alternative était de faire passer un
client en argument à travers chaque méthode de dépôt et chaque use case : soixante fichiers dont le seul
changement serait de porter quelque chose dont ils se moquent, et soixante occasions d'en oublier un. Un
oubli écrirait hors transaction **en silence**, ce qui est exactement le défaut qu'on ferme.

**2. L'annonce passe après le commit.** C'est le point que la dette ne mentionnait pas. Émettre à
l'intérieur de la transaction ferait réagir un écouteur à un monde que personne d'autre ne peut encore
lire. Les faits sont donc **écrits dedans et annoncés après** (`afterCommit`) — et hors transaction il n'y
a rien à attendre, donc ça s'exécute immédiatement, ce qui garde le publisher correct dans les deux cas.
Si un écouteur échoue après coup, l'écriture reste commitée et le fait reste journalisé : §14.5 rend un
fait enregistré rejouable, et annuler toute la requête perdrait justement l'enregistrement qui permet de
rejouer.

**3. Le SQL brut et les transactions imbriquées doivent rejoindre l'ambiante — et l'apprendre a coûté
vingt secondes d'attente.** La chaîne d'audit prend `pg_advisory_xact_lock` puis ouvre sa propre
transaction. Laissées sur le client de base, elles s'exécutaient sur une **autre connexion** et
attendaient des verrous de ligne que la transaction ouverte détenait — jusqu'à expiration. Une requête
brute qui ne rejoint pas la transaction n'est pas seulement en dehors : elle peut la bloquer. Postgres n'a
pas de transaction imbriquée, donc « rejoindre s'il y en a une, en ouvrir une sinon » est la seule
sémantique qui ne bloque pas.

La preuve est dans `test/atomicity.e2e-spec.ts`, et elle porte **son contrôle** : l'intercepteur désactivé,
le test échoue. Une assertion négative sans contrôle passe pour la mauvaise raison.

## 2. Modèle de domaine

### 2.1 `Event` (AggregateRoot, immuable)

**Props** (§4.20) : `workspaceId` (nullable), `type`, `severity`, `actor` (nullable ActorRef),
`targetType`, `targetId`, `payload`, `sequence`, `createdAt`.

`target` du §4.20 est décomposé en `targetType`/`targetId` : une chaîne unique obligerait chaque lecteur à
la re-découper. `sequence` n'est pas dans §4.20 mais §14.1 exige l'ordre — un horodatage ne suffit pas.

**Aucun comportement de mutation.** Un fait ne change pas. C'est la seconde entité du système à n'avoir
aucune machine à états, après Decision, et pour la même raison.

**Gravités** : `INFO | WARNING | ERROR | CRITICAL`.

### 2.2 `EventReceipt` (AggregateRoot, §4.21)

**Props** : `eventId`, `actor` (ActorRef), `status`, `seenAt`, `acknowledgedAt`, `actedAt`.

**Machine à états** (kernel `StateMachine`) :

```text
PENDING → SEEN → ACKNOWLEDGED → ACTED
```

Chaque transition horodate son champ. Progression stricte : on n'a pas agi sans avoir accusé réception.
Idempotence §22.6.

**Un accusé par (événement, acteur)** — unicité garantie en base.

## 3. Couche application

- `RecordEventUseCase` — enregistrement explicite (le Worker, le Scheduler, et tout module qui publie un
  fait sans agrégat derrière).
- `ListEventsUseCase` — journal filtrable : workspace, type, gravité, cible, acteur, fenêtre temporelle,
  depuis une séquence. C'est la lecture qui sert le replay (§14.5).
- `RequireEventReceiptsUseCase` — crée les accusés attendus pour un fait donné et une liste d'acteurs.
- `AdvanceEventReceiptUseCase` — un acteur déclare avoir vu / accusé / agi.
- `ListPendingReceiptsUseCase` — « qu'ai-je à prendre en compte ? », scopé à l'acteur courant.

## 4. Infrastructure

`Event` : `sequence BigInt @default(autoincrement())` (ordre total), `payload Json`, index
`[workspaceId, sequence]`, `[type]`, `[targetType, targetId]`. **Pas d'`updatedAt`.**
`EventReceipt` : unique `[eventId, actorType, actorId]`.

`PersistentEventPublisher` remplace `EventEmitterEventPublisher` : il **écrit puis émet**. L'émission en
processus est conservée — les réactions existantes continuent de fonctionner sans le savoir.

## 5. Interface

Sous `/workspaces/:workspaceId/events` en `read_workspace_state` pour le journal, plus les routes
d'accusé de réception. L'enregistrement explicite d'un fait est réservé aux acteurs qui exécutent
(`execute_tasks`) — publier un fait est un acte de travail.

## 6. Double vérification de complétude

Relecture faite contre la spec entière après le premier vert. Les deux constats de l'analyse (§1.5) se
sont vérifiés à l'usage — le port asynchrone et le `workspaceId` déclaré étaient bien nécessaires, et le
compilateur a trouvé seuls les 6 sites à migrer.

**Un troisième piège, trouvé par l'e2e et pas par les tests unitaires.** Le module Event et le kernel
déclaraient tous deux `EVENT_PUBLISHER` en `@Global()`. Nest ne tranche pas : le gagnant dépend de l'ordre
d'enregistrement. Concrètement, le kernel gagnait et **rien n'était persisté** — tous les tests unitaires
passaient, le journal restait vide en e2e. Le kernel ne lie donc plus ce jeton du tout : le module Event
en est le seul propriétaire. Même correction que pour `GOAL_WORKLOAD`, même leçon — deux propriétaires
d'un jeton global, c'est un tirage au sort déguisé en configuration.

Éléments vérifiés conformes : §4.20 au complet (`target` décomposé en type/id pour ne pas obliger chaque
lecteur à redécouper une chaîne) ; §4.21 avec un accusé par (événement, acteur), unicité en base ;
§14.1 persistance, ordre par séquence monotone (un horodatage ne suffit pas, deux faits partagent une
milliseconde), immuabilité — **aucun chemin de modification, pas même une supersession** ; §14.3 publié
une seule fois ; §14.4 la lecture n'est jamais un attribut de l'événement ; §14.5 le replay est une
**lecture** (ré-émettre déclencherait une seconde fois des réactions déjà exécutées).

**La dette de durabilité est fermée à hauteur de ce qui est vrai** : un fait est écrit **avant** d'être
émis, donc une réaction s'exécute toujours sur un fait déjà au journal, et une réaction perdue peut être
retrouvée. Elle **est** atomique avec l'écriture de l'agrégat depuis la fermeture décrite en §1.7.

**Audit d'accessibilité** : les cinq use-cases ont une route. `execute_tasks` gagne une route
d'enregistrement explicite, celle dont le Worker (§6.8) et le Scheduler (§9.15) auront besoin.

Reports explicites :

- **Versionnement des schémas d'événement** (§14.1 « versionnés ») : tant qu'aucun consommateur externe
  ne lit ces charges utiles, un versionnement serait une abstraction sans utilisateur.
- **Atomicité agrégat/événement** : voir §1.7. C'est le seul vrai reste, et il demande que l'insertion
  partage la transaction du dépôt.
- **Purge / rétention** : un journal croît indéfiniment. Aucune politique n'est inventée ici — c'est au
  Policy Engine (§12) de la porter, et §18.7 interdit la suppression sans audit.
