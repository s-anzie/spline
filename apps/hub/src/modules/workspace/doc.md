# Workspace — Conception détaillée

> Module : `apps/hub/src/modules/workspace/`
> Référence spec : `v3/spline-v3.md` — §4.2 (entité), §4.24 (invariants), §12.2 (héritage des politiques),
> §18.8 (bootstrap `workspace-create`), §22 (machine à états)
> Statut : implémenté, double-vérifié (§7), permissions affinées par l.audit d.accessibilité.

## 0. Intégration — analyse rétroactive

*Section ajoutée après coup. Elle a directement produit une correction : voir §0.5.*

### 0.1 Ce que workspace est dans le système

**L'unité d'isolation** : chaque entité métier porte un `workspaceId`, et chaque garde de permission le
lit. C'est le module dont tous les autres héritent leur périmètre.

### 0.2 Ce qu'il consomme et ce qu'il fournit

Il consomme identity (membership OWNER à la création, `ORGANIZATION_REPOSITORY` pour vérifier la
propriété). Il fournit `WORKSPACE_REPOSITORY` à goal, task et artifact, qui vérifient tous qu'un
workspace est `ACTIVE` avant d'y créer quoi que ce soit.

### 0.3 Ce que les modules à venir en attendront

| Module futur | Attente | Conséquence |
| --- | --- | --- |
| **Scheduler** (§9) et **Runtime** (§6) | respecter `PAUSED` : un workspace en pause fige l'exécution | le statut existe et est distinct d'`ARCHIVED` exprès ; **c'est à eux de l'honorer** |
| **Policy Engine** (§12) | posséder les politiques du workspace | voir §0.5 |
| **Repository Engine** (§8) | un `rootPath` où travailler | `settings` est libre et l'accueillera |

### 0.4 Sémantique de suppression

Logique uniquement (`ARCHIVED` → `DELETED`), jamais physique — sauf la compensation de création, seul
`delete()` du repository, réservé au cas où la membership OWNER échoue.

### 0.5 Ce que l'audit rétroactif a trouvé — et corrigé

**Le module avait absorbé le Policy Engine (§12) en trompe-l'œil.** `settings.policies` était injecté à
la création avec trois règles (`requireValidationBeforeCompletion`, `allowDirectPushToProtectedBranches`,
`maxConcurrentSessionsPerAgent`), et un invariant interdisait de le vider. **Aucune de ces règles n'était
lue nulle part.** Deux référençaient des choses inexistantes (Git, sessions) ; la troisième était en
réalité codée en dur dans les machines à états de Goal et Task. L'API annonçait donc une politique
appliquée qui ne l'était pas — pire qu'une absence, parce qu'un lecteur du code ou un client de l'API
pouvait légitimement croire le contraire.

Supprimé. `settings` est désormais de la **configuration libre** (rootPath, préférences), et
l'invariant §4.2 « un Workspace possède au moins une politique » est une **dette explicite du Policy
Engine** : c'est lui qui possédera des entités Policy héritables (§12.2) et qui pourra l'honorer
réellement.

## 1. Rôle

Le Workspace est l'unité d'isolation principale du système (§4.2) : toutes les ressources métier
appartiennent à exactement un Workspace, lui-même rattaché à une Organization (§4.1). Ce module possède
l'entité, son cycle de vie (statuts), ses réglages, et l'orchestration de création qui fonde l'isolation :
créer un workspace, c'est aussi créer la membership OWNER de son créateur — l'opération de bootstrap
`workspace-create` du registre §18.8, la première route qui ne peut exiger aucune permission préexistante.

Il ne possède pas : les memberships (module identity — ce module les *consomme* via
`GrantWorkspaceMembershipUseCase`), ni les politiques riches (module policy, plus tard — le workspace porte
en attendant un `settings` JSON avec une politique de base, jamais vide, pour honorer l'invariant « un
Workspace possède au moins une politique »).

## 2. Modèle de domaine

### 2.1 `Workspace` (AggregateRoot)

**Props** : `organizationId`, `name`, `slug` (dérivé du nom, même slugification que Organization),
`description` (optionnelle), `status`, `settings` (JSON librement extensible, contient au minimum la
politique de base), `createdAt`, `updatedAt`.

**Statuts et machine à états** (kernel `StateMachine`, §22.6) :

```text
ACTIVE ⇄ PAUSED
ACTIVE → ARCHIVED,  PAUSED → ARCHIVED
ARCHIVED → ACTIVE   (désarchivage explicite)
ARCHIVED → DELETED  (terminal — la suppression est logique, jamais un DROP)
```

`DELETED` est le seul état terminal. Toute transition passe par `changeStatus(next, now)` → outcome §22.6
(idempotent sur même état, résultat typé sinon). Événements : `workspace.created`, `workspace.updated`,
`workspace.status_changed` (un par transition réelle, jamais sur no-op).

**Invariants (§4.2, §4.24)** :

- un Workspace appartient à exactement une Organization (`organizationId` requis) ;
- un Workspace possède un propriétaire — garanti par l'orchestration de création (membership OWNER créée
  dans le même use-case), et par la protection « dernier OWNER » du module identity ensuite ;
- `settings.policies` n'est jamais vide (politique de base injectée à la création) ;
- un Workspace reste entièrement valide sans aucun Repository (§4.24) — aucune référence Git ici ;
- seules les ressources d'un workspace `ACTIVE` sont mutables ; `PAUSED` fige l'exécution (les modules
  runtime la respecteront), `ARCHIVED` fige tout, `DELETED` masque.

### 2.2 Politique de base (`DEFAULT_WORKSPACE_POLICIES`)

Constante exportée du domaine — le minimum §12.3 exprimable sans le Policy Engine :

```json
{
  "requireValidationBeforeCompletion": true,
  "allowDirectPushToProtectedBranches": false,
  "maxConcurrentSessionsPerAgent": 1
}
```

Le module policy la remplacera par de vraies entités héritables (Organization → Workspace → …) sans casser
`settings` (clé conservée, migrée par lui).

## 3. Couche application

- `CreateWorkspaceUseCase` — valide, crée l'agrégat (slug dérivé, settings par défaut fusionnés), persiste,
  **puis** accorde la membership OWNER au créateur (HUMAN uniquement — un agent ne crée pas de workspace),
  publie les événements des deux agrégats. Échec de la membership → le workspace créé sans owner violerait
  l'invariant : l'orchestration est séquencée workspace-d'abord puis membership, et un échec de membership
  déclenche la suppression compensatoire du workspace (pas de transaction inter-agrégats — compensation
  explicite, documentée ici).
- `GetWorkspaceUseCase` — par id, `WorkspaceNotFoundError` sinon ; les `DELETED` sont introuvables par
  défaut.
- `ListWorkspacesForActorUseCase` — via `listByActor` du port memberships (identity) puis chargement des
  workspaces non-`DELETED` ; c'est la vue « mes workspaces », toujours scopée à l'acteur, jamais
  cross-tenant.
- `UpdateWorkspaceDetailsUseCase` — nom (re-slugifié), description, settings (fusion superficielle,
  `settings.policies` ne peut pas devenir vide) ; interdit hors `ACTIVE`.
- `ChangeWorkspaceStatusUseCase` — cible du cycle de vie via la machine à états ; idempotence §22.6
  (même état → succès silencieux) ; `DELETED` définitif. Cinq routes distinctes l'appellent, chacune avec
  sa permission (§5) — le use-case reste unique, c'est l'autorisation qui se différencie.

## 4. Infrastructure

- Modèle Prisma `Workspace` (+ enum `WorkspaceStatus`), `settings Json @default("{}")`.
- **Migration qui ajoute la FK promise** : `workspace_memberships.workspaceId → workspaces.id`
  (`onDelete: Cascade`) — la dette notée dans le schéma identity est soldée ici même.
- `PrismaWorkspaceRepository` : upsert agrégat complet (§5.19), `findById`, `listByIds`, `delete`
  (compensation uniquement). L'unicité de slug par organisation attendra un vrai besoin d'URL (YAGNI —
  voir §6) : aucun port mort n'est créé en avance.
- Test d'intégration : round-trip complet, update intégral prouvé, cascade de suppression des memberships.

## 5. Interface

- `POST /workspaces` — `ActorAuthGuard` seul + `@BootstrapOperation("workspace-create")` (première
  utilisation réelle du registre §18.8) ; refuse les acteurs non humains (403).
- `GET /workspaces` — mes workspaces (tout acteur authentifié).
- `GET /workspaces/:workspaceId` — `read_workspace_state`.
- `PATCH /workspaces/:workspaceId` — `manage_workspace`.
- `POST .../pause` et `POST .../resume` — `operate_workspace` (OWNER **et** HUMAN_OPERATOR : geler
  l'exécution en incident est un acte de pilotage, pas d'administration).
- `POST .../archive`, `.../unarchive`, `.../delete` — `manage_workspace` (fin de vie = propriété).
  Une transition invalide distingue 409 (conflit) de 410 (état terminal) via
  `InvalidStateTransitionError.fromTerminal` — première application concrète de la convention kernel.
- e2e : création (avec vérification que la membership OWNER existe), isolation (un tiers reçoit 403),
  cycle de statuts complet, idempotence d'une transition répétée.

## 6. Décisions notables

| Décision | Raison |
| --- | --- |
| Suppression logique (`DELETED`), jamais physique | §15.5/§18.7 : rien d'important ne disparaît sans trace ; les données restent pour l'audit, l'API les masque. |
| Compensation explicite plutôt que transaction inter-agrégats | Deux agrégats, deux repositories : une transaction traversante coulerait les frontières de modules ; la compensation est locale, testée, et le cas est rare. |
| Slug non unique globalement | Les ids sont les identifiants ; l'unicité de slug est un besoin d'URL qui viendra avec l'UI, et aucun port n'a été créé en avance pour elle. |
| Un agent ne peut pas créer de workspace | La création fonde la propriété humaine (§1.3 Human Supervision) ; un manager agent opère *dans* un workspace, jamais au-dessus. |
| Cinq routes de cycle de vie plutôt qu'une route `/status` | L'autorisation aurait dû dépendre du corps de la requête (pause = opérateur, archive = propriétaire) ; une route par intention laisse le décorateur de permission faire son travail déclarativement. |
| `PAUSED` distinct d'`ARCHIVED` | §4.2 liste les deux ; pause = suspension d'exécution réversible fréquente, archive = fin de vie consultable. Les fusionner perdrait la sémantique que le scheduler exploitera. |

## 7. Double vérification de complétude

Relecture faite contre la spec v3 entière après le premier vert (190 tests unitaires, 26 e2e).
Corrections apportées par cette passe :

- **`GET /organizations` ajoutée** (contrôleur identity, testée e2e) : le report noté par identity §8
  (« les routes Organization viendront avec le module workspace ») arrivait à échéance ici — sans elle, un
  utilisateur de retour ne peut pas retrouver son `organizationId` pour créer un workspace.
- **Doc corrigé sur `existsBySlugInOrganization`** : la conception promettait un port que l'implémentation
  n'a volontairement pas créé (YAGNI) ; c'est le doc qui a été aligné sur le code, pas l'inverse.
- **Assertion e2e corrigée en conscience** : après suppression logique, la membership subsiste (audit), donc
  le guard passe et c'est le use-case qui masque → 404, pas 403. Le test documente ce choix.

Éléments vérifiés conformes : champs et statuts §4.2 au complet (les collections — goals, repositories,
workers… — sont des relations possédées par leurs futurs modules, pas des colonnes) ; invariant « valide
sans Repository » (§4.24 — aucune référence Git nulle part) ; propriétaire garanti par création orchestrée
+ compensation testée (unit) + cascade testée (intégration) ; `settings.policies` jamais vide (création et
patch) ; §22.6 appliqué de bout en bout (idempotence e2e, 409/410 selon `fromTerminal` — première
application concrète de la convention kernel) ; affordances §20.6 exposées (`allowedStatusTargets` dans la
vue) ; bootstrap `workspace-create` §18.8 posé sur la route de création ; agents interdits de création
(testé e2e) ; agrégat complet §5.19 prouvé par test d'intégration rechargeant un agrégat muté
(nom + settings + statut).

Reports explicites (décidés, pas oubliés) :

- **Consommation effective de `@BootstrapOperation` par le guard** : toujours différée — le contrôle
  « ressource ∈ workspace » n'existera qu'avec les premières ressources filles (goals/tasks). Le registre
  reste posé et documenté.
- **`GET /organizations/:id/workspaces`** : la navigation org → workspaces attendra un besoin UI réel ;
  `GET /workspaces` (mes workspaces) couvre le flux principal.
- **Unicité de slug par organisation** : voir §4/§6.
- **Réaction des futurs modules à `PAUSED`** : le scheduler et le runtime devront geler l'exécution d'un
  workspace en pause — c'est leur contrat à eux, noté dans leurs conceptions à venir.
