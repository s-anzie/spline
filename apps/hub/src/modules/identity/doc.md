# Identity & Access — Conception détaillée

> Module : `apps/hub/src/modules/identity/`
> Référence spec : `v3/spline-v3.md` — §4.1 (hiérarchie Organization→Workspace), §18.2 (acteurs),
> §18.3 (RBAC), §18.8 (exception de bootstrap), §10.9/§11.2 (validation humaine), §12.2 (héritage des
> politiques depuis l'Organization)
> Statut : en cours d'implémentation (TDD).

## 1. Rôle

Le module identity possède **qui existe et qui a le droit de faire quoi** : les identités (humains,
agents, workers, services), l'Organization (sommet de la hiérarchie v3), les appartenances aux workspaces
avec leurs rôles, la matrice de permissions, l'authentification (mot de passe + JWT pour les humains,
jetons opaques révocables pour les acteurs machines), et les gardes que tous les autres modules
appliqueront à leurs routes.

Il ne possède **pas** : les entités Agent/Machine elles-mêmes (leurs modules viendront — identity ne
détient que leurs *credentials* et leur *place* dans un workspace), ni les Workspaces (le module workspace
créera la membership OWNER via le port de ce module).

## 2. Acteurs (§18.2)

Quatre types d'acteurs, tous porteurs d'identité — **changement assumé vs v1**, qui excluait explicitement
les machines du modèle d'acteurs ; la v3 (héritée de v2) fait des Workers des acteurs RBAC à part entière :

| Type | Authentification | Exemple d'action |
| --- | --- | --- |
| `HUMAN` | email + mot de passe → JWT | créer un goal, approuver une validation |
| `AGENT` | jeton opaque révocable | exécuter une tâche, demander un lock |
| `WORKER` | jeton opaque révocable | heartbeat, rapporter un statut de session |
| `SERVICE` | jeton opaque révocable | intégration externe (CI, webhook) — prévu, pas prioritaire |

`ActorRef` (value object kernel) = `{ type: ActorType, id: string }` — la référence polymorphe utilisée
par Membership, Credential, AuditEntry, et plus tard par tout `created_by`/`owner` du système.

## 3. Modèle de domaine

### 3.1 `User` (AggregateRoot)

Un humain. Champs : `email` (VO `Email`, normalisé en minuscules, format validé), `passwordHash` (jamais
le mot de passe — le hash est calculé par le port `PasswordHasher` dans la couche application),
`displayName`, `createdAt`. Événement : `identity.user_registered`.

### 3.2 `Organization` (AggregateRoot)

Sommet de la hiérarchie v3 (§4.1) : les Workspaces lui appartiennent, les politiques en héritent (§12.2).
Champs : `name`, `slug` (normalisé, unique), `ownerId` (User), `createdAt`.
Événement : `identity.organization_created`.

**Décision** : à l'inscription, une organisation personnelle est créée automatiquement pour chaque
utilisateur (nom dérivé du displayName). Le multi-organisation avancé (fédération, invitations
inter-orgs) reste en Future Extensions (§25) — mais l'entité existe dès maintenant pour que
Workspace.organization_id ne soit jamais rétrofitté.

### 3.3 `WorkspaceMembership` (AggregateRoot)

L'appartenance d'un acteur à un workspace avec un rôle. Champs : `actor` (ActorRef), `workspaceId`,
`role`, `createdAt`. Invariant : **une seule membership par (acteur, workspace)** — vérifiée en
application, garantie par contrainte unique en base. Événements : `identity.membership_granted`,
`identity.membership_role_changed`, `identity.membership_revoked`.

Le rôle se change par une méthode dédiée idempotente (`changeRole` vers le rôle courant = no-op réussi,
conforme à l'esprit §22.6).

### 3.4 `ActorCredential` (AggregateRoot)

Jeton d'authentification d'un acteur non humain (AGENT / WORKER / SERVICE). Champs : `actor` (ActorRef),
`tokenHash`, `createdAt`, `revokedAt`, `lastUsedAt`. Format du jeton en clair, montré **une seule fois**
à l'émission : `<type>_<credentialId>.<secret>` (ex. `agent_9f2c….K7sd…`) — l'id en clair permet de
retrouver le hash sans table scan, le secret est bcrypt-hashé. Révocation instantanée (`revoke()`
idempotent), pas d'expiration par défaut (cohérent avec v1, qui a fait ses preuves).

Un acteur peut avoir plusieurs credentials actifs (rotation sans coupure) ; l'émission d'un nouveau ne
révoque pas l'ancien — la rotation est explicite.

### 3.5 Rôles et permissions (§18.3)

Six rôles de workspace (hérités de v1, éprouvés en exploitation) :

`OWNER`, `HUMAN_OPERATOR`, `AGENT_MANAGER`, `AGENT_CONTRIBUTOR`, `READ_ONLY_AGENT`, `VIEWER`.

Catalogue de permissions étendu pour couvrir tout le périmètre v3 (14 permissions — v1 en avait 8) :

| Permission | Couvre (chapitres v3) |
| --- | --- |
| `read_workspace_state` | lecture goals/tasks/runs/sessions/events/artifacts (§4, §20) |
| `manage_goals` | créer/modifier/clore les goals (§5.6) |
| `manage_tasks` | créer/assigner/réassigner les tâches (§5.7, assignation atomique §4.6) |
| `execute_tasks` | prendre un run, rapporter la progression (§4.7-4.8, §10) |
| `acquire_locks` | §13 |
| `manage_processes` | start/stop/restart (§4.15) |
| `request_validation` | demander une validation (§10.9 — un agent ne s'auto-valide jamais) |
| `approve_validation` | approbation humaine (§11.2) — **humains uniquement, par construction** |
| `record_decisions` | §4.17 |
| `manage_workspace` | identité et fin de vie du workspace : renommer, décrire, régler, archiver, supprimer |
| `operate_workspace` | levier opérationnel : mettre en pause / reprendre l'exécution |
| `manage_members` | inviter/retirer des acteurs, changer les rôles |
| `manage_machines` | enregistrer/lier des workers (§6.3, bootstrap §18.8) |
| `manage_extensions` | installer/révoquer des extensions (§19.5) |
| `manage_providers` | disponibilité/quota des providers (§4.14) |

Matrice (testée ligne par ligne — la table complète est dans `permission-matrix.spec.ts`) :

- **OWNER** : tout.
- **HUMAN_OPERATOR** : tout sauf `manage_workspace`, `manage_members`, `manage_extensions` — mais **avec**
  `operate_workspace` : geler l'exécution en incident fait partie du pilotage, ça ne peut pas attendre
  le propriétaire.
- **AGENT_MANAGER** : `read`, `manage_goals`, `manage_tasks`, `execute_tasks`, `acquire_locks`,
  `manage_processes`, `request_validation`, `record_decisions`.
- **AGENT_CONTRIBUTOR** : `read`, `execute_tasks`, `acquire_locks`, `manage_processes`,
  `request_validation`, `record_decisions`.
- **READ_ONLY_AGENT** : `read`, `record_decisions`.
- **VIEWER** : `read`.

**Invariant structurel** (testé) : `approve_validation` n'est accordée à **aucun** rôle d'agent — la
séparation « un agent soumet, il ne valide jamais » (§10.9, §11) est encodée dans la matrice, pas dans la
bonne volonté des prompts.

### 3.6 Exception de bootstrap (§18.8)

Un contrôle « cette ressource appartient-elle au workspace de l'appelant » échoue par construction sur
l'action qui établit ce rattachement. Le module définit un **registre nommé et fermé** des opérations de
bootstrap :

```ts
export const BOOTSTRAP_OPERATIONS = ["workspace-create", "machine-link", "first-member-invite"] as const;
```

Le décorateur `@BootstrapOperation("machine-link")` marque une route ; le guard saute le contrôle
d'appartenance de la ressource (jamais le contrôle d'authentification ni de permission) et journalise
l'usage. Ajouter une opération au registre = décision de revue, visible dans ce fichier unique.

## 4. Couche application

Use-cases (tous `UseCase<Input, Result<…>>`, ports par constructeur, doubles en mémoire pour les tests) :

- `RegisterUserUseCase` — email unique, mot de passe ≥ 12 caractères (`WeakPasswordError`), hash par le
  port, création du User **et** de son Organization personnelle ; événements après persistance.
- `LoginUseCase` — vérifie le mot de passe, émet un JWT (`TokenSigner` port) portant
  `{ sub, actorType: HUMAN }`. Échec unique `InvalidCredentialsError` (pas de distinction
  email-inconnu/mauvais-mot-de-passe — anti-énumération).
- `IssueActorCredentialUseCase` — génère le jeton opaque, retourne le clair **une fois**, stocke le hash.
- `RevokeActorCredentialUseCase` — révocation idempotente.
- `VerifyActorTokenUseCase` — parse le format, charge le credential par id, compare le secret, rejette
  si révoqué ; met à jour `lastUsedAt`. C'est le chemin d'auth des gateways machines/agents.
- `GrantWorkspaceMembershipUseCase` / `ChangeMembershipRoleUseCase` / `RevokeWorkspaceMembershipUseCase`
  — gestion des appartenances ; unicité (acteur, workspace) ; le dernier OWNER d'un workspace ne peut pas
  être rétrogradé/retiré (`CannotRemoveLastOwnerError`).
- `CheckPermissionUseCase` (`PermissionsService`) — `can(actor, permission, workspaceId)` : résout la
  membership puis la matrice. Utilisé par le guard.

## 5. Couche infrastructure

- Schéma Prisma (nouvelle lignée `spline_v3_dev`) : `users`, `organizations`, `workspace_memberships`
  (unique `[actorType, actorId, workspaceId]`), `actor_credentials` + enums `ActorType`, `WorkspaceRole`.
  **Règle §5.19** : chaque repository persiste l'agrégat complet (`update: data` intégral).
- `BcryptPasswordHasher` (bcryptjs), `JwtTokenSigner` (@nestjs/jwt).
- Tests d'intégration par repository contre `spline_v3_test`.

## 6. Couche interface

- `AuthController` : `POST /auth/register`, `POST /auth/login`.
- `JwtAuthGuard` (Bearer humain) ; `ActorTokenGuard` (jetons opaques) viendra avec les gateways.
- `PermissionsGuard` + `@RequirePermission(permission)` : 401 sans identité, 403 sans permission ;
  respecte `@BootstrapOperation`.
- `@CurrentActor()` : décorateur d'extraction de l'acteur courant.
- e2e : register→login→route protégée ; refus 401/403 ; unicité email.

## 7. Décisions notables

| Décision | Raison |
| --- | --- |
| Workers = acteurs RBAC (inverse v1) | §18.2 est explicite ; le multi-machine v3 exige que les workers portent leur identité et leurs droits propres, pas un statut d'infrastructure anonyme. |
| Organization dès la V1, auto-créée à l'inscription | Le sommet de hiérarchie (§4.1, §12.2) ne se rétrofitte pas ; le coût aujourd'hui est minime, le multi-org avancé reste futur. |
| `approve_validation` refusée à tous les rôles agents dans la matrice | « Un agent ne déclare jamais lui-même une réussite » (§10.9) doit être une impossibilité structurelle, pas une consigne. |
| Un seul `InvalidCredentialsError` au login | Distinguer « email inconnu » de « mauvais mot de passe » offre une primitive d'énumération d'emails. |
| Credentials multiples par acteur, rotation explicite | Révoquer-puis-réémettre crée une coupure ; émettre-puis-révoquer permet la rotation sans interruption (leçon des credentials sandbox figés, §0.3.6). |
| Jeton `<type>_<id>.<secret>` | Lookup O(1) par id sans indexer le secret ; le préfixe type rend les fuites identifiables dans les logs. |
| Registre de bootstrap fermé (`as const`) | §18.8 exige « une liste nommée, jamais une désactivation générale » — la liste est un point de revue unique. |
| Mot de passe ≥ 12 | Politique minimale sans dépendance ; les règles fines (entropie, breach lists) viendront avec un port dédié si besoin. |

## 8. Double vérification de complétude

Relecture faite contre la spec v3 entière après le premier vert (158 tests unitaires dont 73 identity,
12 e2e). Corrections apportées par cette passe :

- **Course d'inscription concurrente** : deux inscriptions simultanées du même email passaient toutes deux
  la pré-vérification ; le perdant recevait une erreur Prisma brute (500). Le contrôleur mappe désormais la
  violation d'index unique (P2002) sur le même 409 que la pré-vérification — cohérent avec la leçon « pas
  d'échec brut pour un cas attendu » (§22.6 en esprit).
- **Ordre des guards documenté** : `@UseGuards(ActorAuthGuard, PermissionsGuard)` — dans cet ordre,
  toujours ; `PermissionsGuard` exige `request.actor` posé par le premier. C'est la convention que tous les
  contrôleurs des modules suivants appliquent.

Éléments vérifiés conformes : quatre types d'acteurs avec identité (§18.2) ; RBAC en point de décision
unique avant action (§18.3) ; registre de bootstrap fermé (§18.8) ; `approve_validation` inaccessible aux
agents par la matrice (§10.9/§11, testé comme invariant nommé) ; Organization au sommet (§4.1) auto-créée ;
credentials multiples et rotation sans coupure (§0.3.6) ; anti-énumération au login (y compris email
malformé) ; persistance de l'agrégat complet prouvée par test d'intégration (§5.19) ; unicité
(acteur, workspace) garantie par contrainte DB et testée.

Reports explicites (décidés, pas oubliés) :

- **Consommation de `@BootstrapOperation` par le guard** : le contrôle « ressource ∈ workspace »
  n'existera qu'avec les premières ressources filles (goals/tasks) ; le registre et le décorateur sont
  posés (et `workspace-create` est marqué sur sa route depuis le module workspace).
- ~~Routes Organization~~ : **soldé** — `GET /organizations` livrée avec le module workspace
  (`OrganizationController`, e2e couverte), comme prévu ici.
- **Changement d'email / de mot de passe, réinitialisation** : produit réel mais non exigé par la spec V1 ;
  backlog du module, les ports suffisent déjà.
- **Rate-limiting du login** : appartient à la couche gateway/API (§20), pas au module.


## 9. Audit d'accessibilité et de granularité CRUD (2026-08-04)

Revue transverse demandée après le module Goal : est-ce que chaque opération exposée correspond à un vrai
cas d'usage, et est-ce que la granularité de permission a du sens ? L'audit a trouvé un défaut sévère qui
n'était pas de la granularité mais de l'**inaccessibilité pure**.

### Ce qui était cassé

**Six use-cases implémentés, testés, exportés — et injoignables.** `GrantWorkspaceMembership`,
`ChangeMembershipRole`, `RevokeWorkspaceMembership`, `IssueActorCredential`, `RevokeActorCredential`,
`VerifyActorToken` n'avaient aucune route. Conséquence concrète : **un workspace ne pouvait jamais avoir
un second membre.** Impossible d'inviter un collègue, impossible de rattacher un agent. Si les e2e du
module Goal pouvaient utiliser un agent manager, c'est parce qu'ils attrapaient le use-case directement
dans le conteneur DI — une porte dérobée de test, pas une capacité produit.

`manage_members` était donc une **permission morte** : déclarée, testée dans la matrice, utilisée nulle
part — alors que son module est censé être terminé. À distinguer de `manage_tasks`, `acquire_locks`,
`manage_processes`, `request_validation`, `record_decisions`, `manage_machines`, `manage_extensions`,
`manage_providers`, qui sont à zéro route parce que **leur module n'existe pas encore** : celles-là ne
sont pas mortes, elles ne sont pas encore atteintes.

### Ce qui a été corrigé

- **Routes de membres** (`WorkspaceMemberController`) : inviter (par email pour un humain — le seul
  identifiant que l'invitant connaisse réellement —, par référence explicite pour les autres acteurs),
  lister, changer de rôle, révoquer. `manage_members` a enfin des routes.
- **Découpage de `manage_policies`**, qui faisait deux métiers. Devenu `manage_workspace` (renommer,
  configurer, archiver, supprimer — OWNER) et `operate_workspace` (pause/reprise — OWNER **et**
  HUMAN_OPERATOR). La route `/status` unique est devenue cinq routes explicites (`/pause`, `/resume`,
  `/archive`, `/unarchive`, `/delete`) : chacune porte une seule intention et une seule permission,
  déclarativement, au lieu d'une autorisation qui aurait dû dépendre du corps de la requête.
- **`GET /auth/me`** retournait `{actorType, actorId}` : une UI ne pouvait pas afficher qui est connecté.
  Renvoie désormais aussi `displayName` et `email` pour un humain.
- **`PATCH /organizations/:id`** : on restait coincé à vie avec le nom d'organisation dérivé du
  displayName à l'inscription.

### Sémantique de suppression, vérifiée entité par entité

Elle était déjà cohérente et reste inchangée : **logique là où l'audit compte** (Workspace → `DELETED`,
Goal → `CANCELLED`, credential → `revokedAt`), **physique là où la ligne n'est qu'un lien sans histoire
propre** (membership). Aucune entité n'a de `DELETE` qui détruirait une trace.

### Report explicite

**Routes de credentials d'acteurs** (émission/révocation de jetons agents) : volontairement différées au
module agent. Émettre un jeton pour un agent qui n'existe dans aucun registre créerait des orphelins —
c'est le module qui possède l'entité Agent qui doit exposer son onboarding. En attendant, les acteurs
non humains restent rattachables à un workspace par référence explicite.
