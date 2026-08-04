# Artifact — Conception détaillée

> Module : `apps/hub/src/modules/artifact/`
> Référence spec : `v3/spline-v3.md` — §4.10 (entité), §15 (Artifact System), §5.12 (Artifact Service),
> §10.5 (le plan devient un Artifact), §11.10 (chaque rapport de validation est un Artifact),
> §8.12 (les artefacts Git), §18.7 (audit), §19.2 (un Engine déclare les types qu'il produit)
> Statut : implémenté, double-vérifié (§6), audité en accessibilité.

## 1. Intégration — ce que ce module doit à l'écosystème et ce qu'il lui rend

*Analyse faite avant toute conception de domaine : c'est elle qui décide des ports et de la surface
exposée. Sans elle, on simplifie ici ce qu'on paiera cher là-bas.*

### 1.1 Ce qu'Artifact est dans le système

**La mémoire durable du projet** (§15) : « les Artifacts représentent tous les objets produits par
Spline ». Ce n'est pas un module de stockage de fichiers — c'est le **registre de tout ce que le travail
a produit**, avec son historique. Un Artifact n'est jamais supprimé sans audit (§5.12), et certains types
sont immuables par nature (§15.7).

C'est un **module socle** : il ne dépend presque de rien et presque tout dépendra de lui. Ce déséquilibre
oriente toute sa conception — il doit être **généreux en surface d'écriture** (les producteurs sont
nombreux et variés) et **strict en garanties** (immutabilité, versionnement, traçabilité).

### 1.2 Modules existants — ce qu'il consomme aujourd'hui

| Module | Relation | Conséquence de conception |
| --- | --- | --- |
| **workspace** | tout Artifact appartient à un Workspace (§4.10) | FK Cascade, isolation vérifiée comme partout |
| **identity** | `createdBy` est un `ActorRef` ; l'accès passe par la matrice | un agent **produit** des artefacts (c'est son travail) : les permissions doivent le permettre |
| **goal** / **task** | liens optionnels `goalId` / `taskId` (§15.3) | **nullable des deux côtés** : un artefact de workspace sans tâche est légitime |

Rien dans goal/ ni task/ n'importe artifact/ : ce sont **eux** qui sont référencés, pas l'inverse. Le sens
de dépendance est artifact → (workspace, identity, goal, task).

**Les liens vers goal/task sont de vraies clés étrangères**, pas des ids opaques — contrairement à
`Task.repositoryId`. La différence est délibérée : ces deux tables existent déjà, et `onDelete: SetNull`
donne le comportement voulu (supprimer un objectif ne détruit pas ses artefacts, il les délie). Les
cibles sont donc **vérifiées avant écriture** par `ArtifactLinkTargets` — une référence fantôme est sinon
une erreur 500. `repositoryId` reste opaque tant que le Repository Engine ne possède pas sa table (§8).

### 1.3 Modules à venir — ce qu'ils attendront de lui

C'est ici que se joue le coût des simplifications. Quatre modules futurs **produiront** des artefacts :

| Module futur | Ce qu'il produira | Ce que ça impose dès maintenant |
| --- | --- | --- |
| **Validation** (§11.10) | Build/Coverage/Security/Performance/Review Report | des types de rapport, un lien `validationId`, et l'**immutabilité** (§15.7 : un rapport de validation ne se réécrit pas) |
| **Collaboration/protocole** (§10.5) | « le plan devient un Artifact » | un type `PLAN`, produit par un **agent** — donc l'écriture ne peut pas être réservée aux humains |
| **Repository Engine** (§8.12) | diff, logs, commits, rapports, résultats — « deviennent des Artifacts **versionnés** » | le **versionnement** (§15.2) n'est pas optionnel : c'est une exigence nommée d'un module à venir |
| **Extensions** (§19.2) | « un Engine déclare les types d'Artifact qu'il produit » | le catalogue de types **ne peut pas être une enum fermée** — sinon aucune extension communautaire ne pourra produire ses propres artefacts sans modifier le noyau |

Deux modules futurs le **consommeront** en lecture : le **Memory System** (§16.10 : « toute mémoire peut
être reconstruite à partir des Artifacts ») et l'**Audit** (§18.7). Tous deux ont besoin d'une **recherche
riche** (§15.6 : type, auteur, goal, task, repository, date, tags) — d'où un filtre de liste large dès
maintenant plutôt qu'un `findByTaskId` qu'il faudrait élargir six fois.

### 1.4 Décisions que cette analyse impose

1. **`type` est une chaîne libre validée, pas une enum Prisma.** §19.2 exige qu'un Engine tiers déclare ses
   propres types. Une enum fermée obligerait une migration à chaque extension — exactement la
   « simplification coûteuse » à éviter. Les types du §15.1 sont fournis comme **constantes de référence**,
   pas comme contrainte.
2. **Le versionnement est natif, pas ajouté après.** §15.2 et §8.12 l'exigent nommément. Rétrofitter des
   versions sur des artefacts existants serait une migration douloureuse.
3. **L'immutabilité est un attribut de l'artefact, décidé à la création.** §15.7 nomme quatre familles
   immuables ; le module Validation en dépendra directement.
4. **Le filtre de recherche couvre les sept axes du §15.6 dès la première version.**
5. **Métadonnées et contenu séparés** (§15.4) : le module possède les **métadonnées et la référence**
   (`storageRef`), jamais les octets. Le stockage réel (local, S3, Git) est un port que le runtime et le
   Repository Engine implémenteront — ici on ne fait qu'en garder la trace.
6. **Suppression logique uniquement** (§5.12, §15.5) : `ARCHIVED` puis `DELETED`, jamais de disparition.

## 2. Modèle de domaine

### 2.1 `Artifact` (AggregateRoot)

**Props** : `workspaceId`, `goalId` (nullable), `taskId` (nullable), `repositoryId` (nullable),
`type` (chaîne validée), `name`, `description` (nullable), `status`, `currentVersion`, `versions`,
`tags`, `metadata` (Json), `immutable`, `createdBy` (ActorRef), `createdAt`, `updatedAt`.

**`ArtifactVersion`** (entité fille, dans l'agrégat) : `version` (entier croissant), `checksum`,
`storageRef`, `sizeBytes` (nullable), `createdBy`, `createdAt`, `note` (nullable).
Les champs `version`/`checksum`/`storage_ref` du §4.10 vivent donc **sur la version**, pas sur l'artefact —
c'est ce que « chaque modification produit une nouvelle version » (§15.2) implique.

**Machine à états** (§15.5) :

```text
ACTIVE   → ARCHIVED
ARCHIVED → ACTIVE | DELETED
DELETED  → ∅ (terminal)
```

`Created → Versioned → Linked` du §15.5 ne sont pas des états mais des **actes** (ajouter une version,
lier) : les modéliser en statuts empêcherait de verser une version après un lien. Le module les traite
comme des opérations sur un artefact `ACTIVE`.

**Règles** :

- un artefact naît avec **sa première version** (un artefact sans contenu n'est pas une trace) ;
- `addVersion` incrémente, ne remplace jamais — les anciennes restent lisibles (§15.2) ;
- un artefact **immuable** refuse toute nouvelle version et toute modification de métadonnées, mais reste
  archivable (§15.7) ;
- un artefact non-`ACTIVE` refuse les versions et les liens ;
- les liens (`goalId`, `taskId`, `repositoryId`) se posent et se retirent (§15.3, `Linked` du cycle).

**Événements** : `artifact.created`, `artifact.versioned`, `artifact.linked`, `artifact.unlinked`,
`artifact.status_changed`.

### 2.2 Types de référence (§15.1)

`DOCUMENT | LOG | DIFF | COMMIT | CAPTION | REPORT | SCREENSHOT | SPECIFICATION | BENCHMARK | PLAN |
METRICS | MODEL | BUNDLE` — exportés comme constantes utiles à l'UI et aux tests. La validation n'exige
qu'un identifiant non vide en `SCREAMING_SNAKE_CASE`, pour qu'une extension puisse déclarer le sien.

## 3. Couche application

- `CreateArtifactUseCase` — workspace ACTIVE, première version obligatoire, liens vérifiés (même workspace).
- `AddArtifactVersionUseCase` — refuse sur immuable/non-ACTIVE.
- `GetArtifactUseCase` (avec ses versions) / `ListArtifactsUseCase` (les sept axes du §15.6).
- `UpdateArtifactMetadataUseCase` — nom, description, tags, metadata ; refuse sur immuable.
- `LinkArtifactUseCase` / `UnlinkArtifactUseCase`.
- `ChangeArtifactStatusUseCase` — archive/restaure/supprime logiquement.

## 4. Infrastructure

Modèle Prisma `Artifact` + table fille `ArtifactVersion` — **une vraie table cette fois**, contrairement
aux blockers : une version a une identité, une durée de vie propre et sera référencée par les rapports de
validation et les commits Git. `tags` et `metadata` en Json. Index sur `[workspaceId, type]`, `[taskId]`,
`[goalId]`, `[createdAt]`.

## 5. Interface

Sous `/workspaces/:workspaceId/artifacts`. Permissions : la **production** d'artefacts est un acte
d'exécution (`execute_tasks`) — un agent qui travaille produit des traces ; la **gestion** (archiver,
supprimer, délier) relève de `manage_tasks`. La lecture est `read_workspace_state`.

## 6. Double vérification de complétude

Relecture faite contre la spec entière après le premier vert. L'analyse d'intégration écrite **avant** le
domaine (§1) a payé : les quatre décisions qu'elle imposait (type ouvert, versionnement natif, immutabilité
à la création, recherche à sept axes) sont toutes des choses que j'aurais simplifiées sans elle, et que
Validation, le protocole de collaboration, le Repository Engine et les Extensions auraient toutes exigées
plus tard.

**Défaut trouvé — une incohérence entre ma propre conception et mon implémentation.** Le §3 promettait
« liens vérifiés (même workspace) » et le schéma portait de vraies FK vers `goals`/`tasks` ; aucun use-case
ne validait quoi que ce soit. Un lien vers un objectif inexistant remontait donc une violation de contrainte
brute en **500**. C'est l'e2e qui l'a révélé — les tests unitaires passaient tous, puisqu'ils travaillaient
sur des doubles sans intégrité référentielle. Corrigé par `ArtifactLinkTargets`, consulté à la création et
au rattachement, jamais au détachement (retirer une référence ne peut pas laisser de fantôme).

Éléments vérifiés conformes : les neuf champs §4.10 (`version`/`checksum`/`storage_ref` portés par la
version, ce qu'implique §15.2) ; les treize types de référence §15.1 exposés sans fermer le catalogue
(§19.2) ; versionnement append-only prouvé en intégration et e2e ; les huit relations §15.3 ;
séparation métadonnées/contenu §15.4 (le module ne détient jamais les octets) ; cycle de vie §15.5 avec
suppression logique seule ; recherche §15.6 sur les sept axes ; immutabilité §15.7 qui protège le contenu
sans empêcher l'archivage ; §5.19 prouvé par rechargement.

**Audit d'accessibilité** : les sept use-cases ont une route. Répartition des permissions selon qui agit
réellement — **produire** une trace est un acte d'exécution (`execute_tasks`, un agent au travail en
produit), **administrer** (lier, archiver, supprimer) relève de `manage_tasks`.

Reports explicites :

- **Port de stockage** : le module garde `storageRef`, jamais les octets (§15.4). Le port d'écriture réelle
  (local, S3, Git) appartient au runtime et au Repository Engine — les y placer maintenant serait inventer
  une abstraction sans consommateur.
- **Filtre par tags en mémoire** : les tags vivent dans une colonne JSON ; le périmètre workspace borne
  déjà l'ensemble. À revoir si le volume l'exige, pas avant.
- **`repositoryId` non vérifié** : sa table n'existe pas encore (§8).
