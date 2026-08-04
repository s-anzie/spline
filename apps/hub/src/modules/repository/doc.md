# Repository — Conception détaillée

> Module : `apps/hub/src/modules/repository/`
> Référence spec : `v3/spline-v3.md` — §8 (Repository Engine), §8.3 (branches), §8.4 (worktrees),
> §8.7 (merge), §8.11 (protections), §19.2 (contrat d'Engine), §26 (« jamais une condition »),
> §3 (le hub est un control plane), §11 (validations), §12 (politiques), §18.7 (audit du merge)
> Statut : implémenté, double-vérifié (§4), audité en accessibilité et en isolation.

## 1. Intégration — ce que ce module doit à l'écosystème et ce qu'il lui rend

### 1.1 Deux phrases de la spec qui décident de tout

**« Il n'est pas le cœur du système »** (§8, ouverture). Et §26 : « une Task, un Goal ou un Workspace
fonctionnent pleinement sans qu'aucun Repository n'existe — le logiciel reste un cas d'usage, jamais une
condition. »

C'est la vision produit (§1) au niveau du code, et elle se vérifie mécaniquement : **rien dans task,
goal, workspace, validation ou policy ne doit changer** parce que ce module existe. La couture était déjà
là — `Task.repositoryId` est nullable depuis le module task, `REPOSITORY` est un niveau de portée sauté
par policy et par memory quand il manque. Ce module remplit ces trous ; il n'en creuse pas de nouveaux.

**« Les agents ne manipulent jamais directement Git ; ils demandent des opérations, le Repository Engine
les réalise. »** Cette phrase désigne l'Engine, pas le hub — et la distinction est la décision
d'architecture du module (§1.2).

### 1.2 Ce que le hub peut et ne peut pas faire, et pourquoi ça tranche le périmètre

Le hub est un control plane (§3). Il n'a pas de copie de travail, pas de système de fichiers par
workspace, et §24 en fait un serveur. **Il ne peut donc pas exécuter Git** — et surtout, il ne peut pas
*détecter* un conflit : un conflit se découvre en tentant réellement une fusion.

Le partage est donc le même que pour Validation, et pour la même raison :

| | Le hub (ici) | Le Worker (§6-7, absent) |
| --- | --- | --- |
| §8.2-8.4 | le modèle : dépôts, branches, worktrees, et leurs invariants | les répertoires réels |
| §8.3 | **la règle de nommage**, refusée si violée | `git checkout -b` |
| §8.4 | **l'exclusivité** d'un worktree par tâche, garantie en base | `git worktree add` |
| §8.7 | **les conditions de fusion**, vérifiées avant d'autoriser | `git merge` |
| §8.11 | **les protections**, comme règles | ce que le dépôt refuse physiquement |
| §8.8-8.9 | rien — voir §1.6 | la détection de conflit |

Ce qui reste ici est ce qui a de la valeur et que le Worker ne peut pas décider seul : **les règles**. Un
Worker qui déciderait lui-même s'il a le droit de fusionner rendrait §8.7 décoratif.

### 1.3 Le contrat d'Engine, extrait plutôt qu'inventé

§8 dit que ce module est « **le premier Engine installable, fourni nativement, et l'exemple qui sert de
modèle au contrat que tout autre Engine doit respecter** (§19.2) ».

§19.2 énumère ce qu'un Engine déclare : les types d'Artifact qu'il produit, les types de Validation qu'il
sait exécuter, les Tools dont il dépend, un mécanisme de préparation d'environnement (« l'équivalent du
Worktree pour Git »), et des **critères de complétion vérifiables, jamais une simple déclaration de
l'agent**.

**L'analyse concluait d'abord qu'il fallait déclarer tout cela maintenant.** L'implémentation a montré
le contraire, et la raison est celle-là même qui justifie l'idée : deux des cinq éléments du contrat — le
« mécanisme de préparation d'environnement » et les « critères de complétion vérifiables » — ont ici leur
moitié exécutante dans le Worker, qui n'existe pas. Extraire le contrat d'un demi-cas produirait
exactement l'interface imaginée que §19.2 cherche à éviter, avec l'inconvénient supplémentaire d'avoir
l'air d'être adossée à un cas réel.

Le contrat sera donc extrait quand ce module sera complet. Ce qui reste vrai de l'analyse, et qui guide
déjà le code : ce module doit être écrit **comme un Engine**, pas comme un morceau de noyau — c'est
pourquoi rien ailleurs ne l'importe (§1.1).

### 1.4 Ce qu'il attend des modules existants

| Module | Ce qu'il lui demande | Forme |
| --- | --- | --- |
| **workspace** | l'existence, la portée | contrôle avant écriture |
| **task** | qu'une branche et un worktree se rattachent à une vraie tâche du workspace | dépôt de tâches, comme decision et artifact |
| **validation** | §8.7 « validations réussies » | **`TASK_PROOF`, tel quel** — voir §1.5 |
| **policy** | §8.7 « politiques satisfaites », §12.3 type Git | une règle `protected_branches`, quatrième consommateur du moteur |
| **audit** | §18.7 audite « Merge » | quatrième producteur d'audit, et la première des quatre actions manquantes à trouver son producteur |
| **lock** | §13.1 liste branche et worktree parmi les ressources verrouillables | rien à faire : le type de ressource est une chaîne libre |

### 1.5 Une observation qui évite un doublon coûteux

§8.7 conditionne la fusion à « validations réussies ». §11.7 conditionne la complétion d'une tâche à la
même chose. Il serait naturel d'écrire un second contrôle ici.

**C'est la même question** : le travail de cette tâche est-il prouvé ? `TaskProofPort` y répond déjà, il
est déclaré par task et fourni par validation, et il est global. Ce module le consomme **tel quel**.
Écrire un contrôle parallèle donnerait deux endroits à garder d'accord, et le jour où ils divergeraient,
une fusion passerait sur un travail qu'on refuse de compléter.

### 1.6 Ce qu'il ne fait pas, et pourquoi

- **Il n'exécute aucune commande Git.** Voir §1.2.
- **Il ne détecte pas les conflits** (§8.8-8.9). Un conflit se découvre en tentant une fusion, ce qui
  demande une copie de travail. Le hub peut *enregistrer* qu'un conflit a été signalé et le faire bloquer
  la tâche (§8.9), mais il ne peut pas en trouver un — et une détection qui ne détecte rien serait pire
  que son absence. Le modèle attend le Worker.
- **Il ne valide pas Git** (§8.10 : Build, Tests, Lint, Security, Policy, Review). Ce sont des
  Validations, et le module validation les porte déjà. Ce module exige qu'elles aient réussi ; il ne les
  exécute pas.
- **Il ne fabrique pas d'Artifacts Git** (§8.12). Un diff ou un log est produit par une exécution.
  L'Artifact existe, le producteur non.

## 2. Modèle de domaine

### 2.1 `Repository` (AggregateRoot)

**Props** (§8.2) : `workspaceId`, `name`, `origin`, `defaultBranch`, `protectedBranches`, `status`.

`protectedBranches` par défaut : `main`, `master`, `develop` — les trois que §8.3 interdit nommément. La
politique `protected_branches` (§12.3, type Git) peut en ajouter ; elle n'en retire jamais, sans quoi une
politique pourrait désarmer §8.11.

### 2.2 `Branch`

**Props** : `repositoryId`, `name`, `kind` (`TASK` | `GOAL` | `AGENT` | `PROTECTED`), `taskId?`,
`goalId?`, `status`.

Le nom est **dérivé, pas saisi** : `task/<task-id>`, `goal/<goal-id>`, `agent/<session-id>` (§8.3). Un
nom libre laisserait créer `main` par mégarde ; en le dérivant, la règle n'est pas vérifiée après coup,
elle est la seule façon d'en obtenir un.

### 2.3 `Worktree`

**Props** : `repositoryId`, `branchId`, `taskId`, `path`, `status`.

**« Deux tâches ne partagent jamais le même Worktree »** (§8.4) est garanti par une contrainte d'unicité
en base, pas par une lecture puis une écriture — même raisonnement que l'`activeKey` d'un verrou.

### 2.4 `MergeRequest`

**Props** : `repositoryId`, `sourceBranchId`, `targetBranchId`, `taskId`, `status`, `requestedBy`,
`decidedBy?`, `conflicts`.

§8.7 : « jamais réalisé par un agent ». La permission d'approuver est `approve_validation`, que la
matrice refuse structurellement à tout rôle d'agent — la règle est donc tenue par le même invariant qui
empêche un agent de valider son propre travail.

## 3. Use-cases

| Use-case | Rôle |
| --- | --- |
| `RegisterRepository` | §8.2 |
| `OpenBranch` | §8.3 — nom dérivé, protections respectées |
| `OpenWorktree` | §8.4 — un par tâche, garanti en base |
| `RequestMerge` | §8.5 |
| `DecideMerge` | §8.7 — les conditions, puis approbation ou refus |
| `ArchiveWorktree` | §8.5 — la fin du cycle, et la libération de la place |
| lectures | dépôts, branches, worktrees, demandes (un service, voir §4) |

`ReportConflict` / `ResolveConflict` figuraient dans cette liste à la conception. Ils n'existent pas :
enregistrer un conflit que rien ne peut détecter donnerait une entité alimentée par personne (§4).

## 4. Double vérification de complétude

**La phrase du §26 est vérifiée mécaniquement, pas affirmée.** Un test déroule un cycle complet —
objectif, tâche, soumission, preuve, complétion, santé du workspace — dans un workspace **sans aucun
dépôt**, et rien n'en souffre. C'est la vision produit (§1) transformée en assertion : le logiciel reste
un cas d'usage.

**Deux règles tenues par la forme plutôt que par un contrôle.**

1. **§8.3** — le nom de branche est *dérivé*, jamais fourni. Le pire qu'un appelant puisse demander est
   `task/main`, ce qui est inoffensif. Un champ libre aurait obligé à re-vérifier la règle à chaque site
   d'appel ; dérivé, il n'y a rien à vérifier.
2. **§8.4** — « deux tâches ne partagent jamais le même Worktree » est garanti par un index unique sur
   `openForTask`, qui porte l'identifiant de la tâche tant que le worktree est ouvert et `NULL` ensuite.
   Deux requêtes concurrentes passeraient toutes deux une lecture ; une seule passe l'index. Même
   mécanisme que l'`activeKey` d'un verrou, et l'archivage libère la place.

**L'observation qui évite un doublon coûteux, confirmée à l'usage.** §8.7 conditionne la fusion aux
« validations réussies » ; §11.7 conditionne la complétion à la même chose. C'est **la même question** —
le travail de cette tâche est-il prouvé ? — donc `TASK_PROOF` est consommé tel quel. Un second contrôle
aurait donné deux endroits à garder d'accord, et le jour de leur divergence une fusion serait passée sur
un travail que le système refuse de considérer terminé.

**§8.7 « jamais réalisé par un agent » repose sur un invariant existant**, pas sur une garde de plus : la
permission est `approve_validation`, que la matrice refuse structurellement à tout rôle d'agent. L'agrégat
le redit néanmoins, pour être correct seul et pas seulement parce qu'une garde s'est exécutée. Les deux
sont testés.

**§18.7 gagne son quatrième producteur** — « Merge » est la première des quatre actions qui n'en avaient
pas. L'entrée porte l'avant et l'après, ce qu'aucun Event ne peut porter.

Éléments vérifiés conformes : §8.2 (dépôt, origine, branche par défaut) ; §8.3 (les trois formes, refus
des noms protégés) ; §8.4 (exclusivité) ; §8.5 (le cycle jusqu'à Archive, sans les étapes d'exécution) ;
§8.7 (les quatre conditions, **toutes rapportées d'un coup** — un refus qui n'en révèle qu'une par
tentative fait corriger, réessayer, découvrir la suivante) ; §8.11 (les protections sont **calculées**,
donc une configuration ne peut pas les réduire) ; §4.2 (isolation testée) ; §20.6 (affordances exposées).

**Audit d'accessibilité** : tous les use-cases ont une route. Les lectures passent par un service unique
plutôt que par quatre use-cases dont le corps entier serait « vérifier que le workspace possède ce dépôt,
puis lire ».

Reports explicites, avec leur raison :

- **Toute exécution Git** : le hub est un control plane sans copie de travail (§3). C'est le Worker
  (§6-7).
- **La détection de conflits** (§8.8-8.9) : un conflit se découvre en *tentant* une fusion. Le modèle
  peut enregistrer qu'un conflit a été signalé ; il ne peut pas en trouver un, et une détection qui ne
  détecte rien serait pire que son absence. La porte de fusion consulte donc une liste de conflits
  ouverts qui est vide **parce que personne n'en a signalé**, pas parce qu'il n'y en a pas — écrit tel
  quel dans le code.
- **Les politiques Git** (§8.7 « politiques satisfaites », §12.3) : les contrôles décrits — branches
  protégées côté dépôt, signature des commits, review obligatoire — s'exercent contre une copie de
  travail. La condition est présente dans la porte et sa liste est vide, pour la même raison que les
  conflits.
- **La validation Git** (§8.10) : Build, Tests, Lint, Security, Policy, Review **sont** des Validations,
  et le module validation les porte. Ce module exige qu'elles aient réussi ; il ne les exécute pas.
- **Les artefacts Git** (§8.12) : un diff est produit par une exécution.
- **Le descripteur d'Engine** (§19.2) : reporté volontairement. §8 fait de ce module « l'exemple qui sert
  de modèle au contrat », et le contrat inclut « un mécanisme de préparation d'environnement » et des
  « critères de complétion vérifiables » — deux choses dont la moitié exécutante manque encore. Extraire
  le contrat maintenant reviendrait à l'extraire d'un demi-cas, ce qui est exactement le défaut que §19.2
  cherche à éviter. Il sera extrait quand le Worker rendra ce module complet.
