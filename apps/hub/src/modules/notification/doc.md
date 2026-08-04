# Notification — Conception détaillée

> Module : `apps/hub/src/modules/notification/`
> Référence spec : `v3/spline-v3.md` — §4.18 (Notification), §4.19 (NotificationRecipient),
> §5.13 (Notification Service), §20.4 (contrat de requête), §17.9 (alertes), §10.4 (l'agent lit ses
> notifications), §26 (critère de succès testé)
> Statut : implémenté, double-vérifié (§6), audité en accessibilité et en isolation.

## 1. Intégration — ce que ce module doit à l'écosystème et ce qu'il lui rend

### 1.1 Ce que Notification est dans le système

**Le canal adressé.** C'est toute sa raison d'être, et elle se comprend par différence avec le module
event livré juste avant :

| | Event | Notification |
| --- | --- | --- |
| nature | un fait accompli | un message adressé |
| destinataire | aucun — il est diffusé | résolu, matérialisé, nominatif |
| lecture | par `EventReceipt`, seulement si un type l'exige | intrinsèque : sans destinataire, il n'y a pas de message |
| origine | le travail ordinaire, sans que personne le demande | un acte délibéré (écrire à quelqu'un, alerter quelqu'un) |

§5.13 tranche explicitement : le Notification Service « ne transporte jamais les événements système
bruts ». Un miroir du journal dans la boîte de réception de chacun serait précisément l'erreur.

Deuxième point structurant, hérité de v1 et restauré en v3 : **`chat_message` et `system_alert` sont un
seul modèle** (§4.18). Un message d'agent à agent et une alerte « worker hors ligne » partagent le
fan-out, l'état de lecture et l'accusé. Deux implémentations parallèles, c'est deux fois le même bug.

### 1.2 Ce qu'il attend des modules existants

| Module | Ce qu'il lui demande | Forme |
| --- | --- | --- |
| **identity** | « qui sont les destinataires d'un broadcast dans ce workspace ? » | `WorkspaceAudiencePort` **déclaré ici**, fourni par identity — même inversion que `ActorWorkloadPort`, rien dans notification/ n'importe l'infrastructure d'identity |
| **workspace** | que le workspace existe | vérifié avant écriture, comme decision et artifact : la FK existe, donc sans contrôle c'est un 500 |
| **task** | que `task_id` (fil de discussion, §4.18) désigne une vraie tâche **du même workspace** | même précédent que `ArtifactLinkTargets` — une référence fantôme est un 500, une référence silencieuse serait pire |
| **event** | de quoi déclencher une alerte | abonnement à un fait, jamais un import de module (§1.5) |

### 1.3 Ce que les modules à venir en attendront

| Module futur | Attente | Conséquence dès maintenant |
| --- | --- | --- |
| **Validation Engine** (§11, §10.9) | « l'agent demande Validation, il ne décide jamais lui-même que son travail est terminé » — la demande est un message adressé à qui peut valider | `kind = system_alert` suffit ; ne pas inventer un troisième `kind` pour ça tant que Validation n'existe pas |
| **Policy Engine** (§12) | « toute violation génère un Event, une entrée Audit, **et une Notification** » | la création d'alerte est un use-case appelable, pas seulement un écouteur privé |
| **Worker / Agent Runtime** (§7, §17.9) | Worker Offline, Lease Expired, Runtime Crash, Provider Unavailable | ce sont les producteurs des faits ; ce module fournit le canal, eux fourniront les écouteurs |
| **Realtime** (§20.5) | pousser aux clients connectés | `DELIVERED` existe pour que le transport l'estampille. **Rien ne le fait aujourd'hui** — l'état est prévu, pas simulé (§1.6) |
| **Agent Runtime** (§10.4) | « Read : Artefacts, Décisions, Blockers, **Notifications** » | la requête des non-lus est le point d'entrée d'un agent dans son cycle : elle doit être scopée, indexée et bon marché |
| **Audit** (§4.23, §18.7) | qui a été prévenu, quand, et s'il a agi | les horodatages par destinataire sont déjà la matière première |

### 1.4 Ce qu'il ne fait pas

- **Il ne recopie pas le journal.** §5.13. Un Event n'engendre une Notification que si quelqu'un doit
  *agir*, et seulement quand le destinataire est déterminable (§1.5).
- **Il ne décide pas qui doit être alerté** pour une condition système donnée. C'est une politique
  (§12). Une règle « gravité ≥ WARNING → prévenir tout le monde » serait une politique inventée, et du
  spam : le module event classe déjà la gravité, il ne s'ensuit pas qu'on sache à qui elle importe.
- **Il ne livre pas.** Aucun transport n'existe encore. Il enregistre l'état de livraison pour qu'un
  transport puisse l'écrire ; il ne prétend pas l'avoir fait.
- **Il ne modifie pas une notification émise.** Comme Event et Decision : pas de machine à états sur le
  parent, aucun chemin d'édition. On ne rattrape pas un message envoyé, on en envoie un autre.

### 1.5 Le seul écouteur câblé maintenant, et pourquoi celui-là seulement

§17.9 liste huit alertes. **Sept concernent des modules qui n'existent pas encore** (Worker, Lease,
Validation, Policy, Repository, Provider, Extension) : les câbler aujourd'hui reviendrait à inventer
leurs producteurs.

La huitième condition ne figure pas dans cette liste mais remplit le critère qui compte — **un
destinataire déterminé sans recourir à une politique** : `task.assigned`. §4.6 impose qu'une tâche ait
exactement un propriétaire dès sa création ; ce propriétaire doit l'apprendre. Le destinataire est
exactement un, personne n'a à décider qui. C'est le message adressé archétypal, et il prouve le pont
Event → Notification avec un vrai consommateur — comme l'annulation en cascade avait prouvé le bus.

À l'inverse, `task.blocker_reported` **n'est pas** câblé, alors qu'il serait tentant : qui prévenir d'un
blocage ? Les humains du workspace ? Le propriétaire du goal ? La réponse dépend d'une politique. Tant
qu'elle n'est pas exprimable, choisir à sa place serait figer une décision qui ne m'appartient pas.

L'écouteur vit **ici** et non dans task : réagir à un fait pour en faire un message adressé, c'est la
responsabilité d'alerting du §5.13. Il passe par le bus, donc aucun import de `TaskModule`.

### 1.6 Deux entités, deux cycles de vie — pourquoi le destinataire est un agrégat à part

`Notification` est immuable ; `NotificationRecipient` change souvent, individuellement, et en
concurrence. Les loger dans un seul agrégat obligerait, pour marquer **un** destinataire comme lu, à
charger la notification et ses cinquante lignes, à en réécrire une, et à perdre au passage les
modifications concurrentes des quarante-neuf autres.

Ce sont donc deux agrégats — même raisonnement que `Event` / `EventReceipt`. Mais §4.19 exige que les
destinataires soient **générés à la création**, ce qui interdit deux écritures indépendantes : la
création est donc **une seule opération du dépôt de notifications** (`create(notification, recipients)`,
insertion imbriquée, une transaction), tandis que les lectures et avancées individuelles passent par le
dépôt de destinataires. Création conjointe, mutation individuelle : c'est exactement l'invariant.

**La machine du destinataire est monotone, mais pas uniformément stricte** — et la nuance est réelle :

```
PENDING ──▶ DELIVERED ──▶ SEEN ──▶ ACKNOWLEDGED ──▶ ACTED_ON
   │            ▲           ▲
   │            │           │
   └── FAILED   └───────────┴── PENDING ──▶ SEEN directement : légitime
```

`DELIVERED` est un fait **du transport**, les trois suivants sont des déclarations **du destinataire**.
Un destinataire qui interroge lui-même ses non-lus (§10.4) n'a jamais été « livré » par un push : lui
imposer de passer par `DELIVERED` serait lui faire mentir. En revanche `ACTED_ON` sans `ACKNOWLEDGED`
reste refusé : on n'agit pas sur ce qu'on n'a pas accusé. `FAILED` n'est atteignable que depuis
`PENDING` — un échec de livraison, avec sa raison ; il ne masque jamais une lecture déjà acquise.

### 1.7 Isolation — dit explicitement, vu ce qui vient d'être corrigé

Le workspace est **obligatoire** sur la création comme sur les non-lus (§4.2, §20.4). Le critère de
succès du §26 s'énonce entièrement à l'intérieur d'un workspace : envoyée à plusieurs agents, un agent
la lit, la requête « non-lu » ne la retourne plus pour lui mais encore pour les autres. Un destinataire
n'a pas de workspace propre : il hérite de celui de sa notification, donc la requête filtre **au
travers du parent**, jamais sur le seul identifiant d'acteur — c'est précisément l'erreur qui avait été
commise sur `event_receipts` et qui est documentée dans `kernel/doc.md` §5.1.

## 2. Modèle de domaine

### 2.1 `Notification` (AggregateRoot, immuable)

**Props** (§4.18) : `workspaceId`, `kind` (`CHAT_MESSAGE` | `SYSTEM_ALERT`), `taskId?`, `fromActor?`,
`title`, `body`, `payload`, `scope` (`DIRECT` | `BROADCAST`), `createdBy`, `createdAt`.

`from_agent_id` du §4.18 devient `fromActor: ActorRef` : un humain écrit aussi, et le système alerte
sans être un agent. Restreindre l'émetteur aux agents obligerait à un second champ dès le premier
message humain.

Aucun comportement de mutation — troisième entité sans machine à états, après Decision et Event.

### 2.2 `NotificationRecipient` (AggregateRoot)

**Props** (§4.19) : `notificationId`, `recipient: ActorRef`, `deliveryStatus`, `deliveredAt`,
`readAt`, `acknowledgedAt`, `actionTakenAt`, `lastSeenAt`, `failureReason`.

Machine décrite en §1.6. Chaque étape estampille son horodatage une seule fois.

## 3. Ports

- `NOTIFICATION_REPOSITORY` — `create(notification, recipients)` (atomique), `findById`, `list(filter)`.
- `NOTIFICATION_RECIPIENT_REPOSITORY` — `save`, `findByNotificationAndActor(workspaceId, …)`,
  `listUnread(workspaceId, actor)`, `list(filter)`.
- `WORKSPACE_AUDIENCE` — `membersOf(workspaceId): Promise<ActorRef[]>`, déclaré ici, fourni par identity.

## 4. Use-cases

| Use-case | Rôle |
| --- | --- |
| `SendNotification` | crée + résout le fan-out à la création (§4.19) |
| `RaiseAlert` | `kind = SYSTEM_ALERT` ; appelable par Policy (§12) demain |
| `ListNotifications` | le journal adressé d'un workspace |
| `ListUnreadForMe` | §20.4 / §10.4 — scopé (workspace, acteur) |
| `AdvanceRecipient` | le destinataire déclare pour lui-même |
| `MarkDelivered` | estampille du transport (§20.5) |
| `NotifyAssigneeOnTaskAssigned` | l'unique écouteur câblé (§1.5) |

## 5. Routes

Toutes sous `/workspaces/:workspaceId/notifications`, plus `…/notifications/unread/mine`.

## 6. Double vérification de complétude

Relecture faite contre la spec après le premier vert. Le critère du §26 est tenu **et testé deux fois** :
en unitaire (`notification.use-cases.spec.ts`) et de bout en bout (`notification.e2e-spec.ts`) — envoyée à
plusieurs, lue par un seul, elle disparaît pour lui seul, à l'intérieur d'un workspace.

**Ce que l'analyse avait mal prévu, et que les tests ont trouvé.**

§1.5 affirmait que `task.assigned` suffisait pour prévenir le propriétaire d'une tâche. Faux :
`Task.create` n'émet que `task.created`. L'écouteur aurait donc prévenu tous les propriétaires
**sauf le premier** — précisément celui que §4.6 rend obligatoire dès la création. L'écouteur réagit
maintenant aux deux faits. L'erreur est instructive : j'avais raisonné sur le nom de l'événement plutôt
que sur les chemins qui l'émettent.

**Un défaut de fond, trouvé par la suite complète et invisible en isolation.** L'écouteur s'exécutait en
« fire-and-forget » : `EventEmitter2.emit()` ne rend pas la main aux gestionnaires asynchrones, donc la
réaction courait après la réponse HTTP. Le test passait seul et échouait sous charge. `PersistentEventPublisher`
utilise désormais `emitAsync`, donc une réaction s'achève **dans la requête qui l'a causée**. Le compromis
est assumé et écrit dans le code : un écouteur lent ou en échec devient visible dans l'appel d'origine au
lieu de disparaître. Sans file d'attente dans le système, visible-et-lent vaut mieux que silencieux-et-perdu,
et le fait est déjà au journal, donc rejouable (§14.5).

**Une instabilité de tests, expliquée plutôt que tolérée.** Des échecs erratiques (trois tests différents
sur trois exécutions) venaient d'un **interblocage Postgres 40P01** dans la remise à zéro entre tests :
`TRUNCATE … CASCADE` atteignait des tables absentes de la liste écrite à la main, donc l'ordre de
verrouillage variait. La liste est maintenant lue depuis `pg_tables`, triée — ce qui supprime au passage la
classe d'erreur « un module ajoute une table et oublie la liste ». Le retry sur interblocage, lui, ne se
déclenchait jamais : Prisma expose `P2010` en surface et garde `40P01` dans `meta`.

Éléments vérifiés conformes : §4.18 (modèle unique chat/alerte, aucun chemin de mutation) ; §4.19
(une ligne par destinataire réel, écrite **dans la même transaction** que la notification, jamais
recalculée) ; §5.13 (le module ne recopie pas le journal) ; §20.4 et §4.2 (workspace obligatoire partout,
testé y compris sur la tentative d'acquittement via l'URL d'un autre workspace) ; §20.6
(`allowedStatusTargets` exposé avant l'échec).

**Audit d'accessibilité** : les quatre use-cases ont une route. `RaiseAlert` n'a **pas** de use-case
distinct — c'est `SendNotification` avec `kind = SYSTEM_ALERT` ; en créer un second n'apporterait qu'un
nom.

Reports explicites, avec leur raison :

- **Sept des huit alertes du §17.9** (Worker Offline, Lease Expired, Validation Failed, Policy Violation,
  Repository Conflict, Provider Unavailable, Runtime Crash) : leurs producteurs n'existent pas. Les câbler
  serait inventer les modules qui les émettent.
- **`task.blocker_reported`** : le destinataire dépend d'une politique (§12). Choisir à sa place figerait
  une décision qui n'appartient pas à ce module.
- **`DELIVERED` n'est estampillé par personne** : aucun transport n'existe (§20.5). L'état est prévu pour
  que le Realtime l'écrive, il n'est pas simulé.
- **Aucune borne sur les échanges** entre acteurs — voir l'étude OpenClaw, `v3/spline-v3.md` §10.18.
