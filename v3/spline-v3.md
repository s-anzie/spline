# Spline — Architecture Specification (SAS)

**Version:** 3.0
**Status:** Draft
**Target:** V1 Implementation
**Language:** English (architecture) / French documentation allowed

---

## 0. Lineage & Rationale

Cette version remplace `specs/1-spline-sepc.md` à `specs/8-spline-v1-unified.md` (le brouillon v1, écrit par itérations
successives) et `v2/spline-v2.md` (le brouillon v2). Elle n'est pas une simple fusion des deux : c'est une refonte
qui corrige des angles morts précis, identifiés en confrontant les deux brouillons à ce qui a réellement été
construit, fait tourner, et cassé pendant l'implémentation.

### 0.1 Ce que v2 a bien fait, et que v3 garde

Le brouillon v2 a introduit des idées structurellement justes que v1 n'avait pas : un Scheduler explicite fondé sur
un graphe de dépendances (DAG), une séparation Run/Attempt permettant de vraies reprises et un vrai suivi de coût
par tentative, un Policy Engine hiérarchique générique, et un traitement plus sérieux de la reprise après panne.
Ces apports sont conservés.

### 0.2 Ce que v2 a perdu en route, et que v3 restaure

En réécrivant proprement, v2 a silencieusement perdu plusieurs décisions que v1 avait durement acquises — pas par
théorie, mais par un vrai bug de production vécu avec l'outil précédent (« agent-chat v2 », cité nommément dans
`specs/7-spline-message-entity.md`). Ce sont des régressions, pas des simplifications :

- **`NotificationRecipient` a disparu.** v1 (`specs/6-spline-broadcast.md`, `specs/7-spline-message-entity.md`)
  avait établi, après avoir cassé `ack` en production sur les broadcasts, qu'une notification adressée à plusieurs
  destinataires **doit** matérialiser une ligne par destinataire réel *au moment de l'envoi*, jamais une chaîne
  `to: all` réinterprétée différemment à chaque lecture. v2 a réduit `Notification` à une entité plate sans
  destinataires. v3 restaure le modèle à deux entités (4.18-4.19).
- **`EventReceipt` a disparu.** v1 avait explicitement tranché qu'un `Event` ne porte jamais de champ de lecture —
  si un type d'événement a besoin d'un accusé par agent, c'est une entité séparée. v2 n'en parle plus du tout. v3
  la restaure (4.20).
- **Le test d'acceptation du scénario broadcast/lecture-partielle, lui, est restauré — mais scopé par workspace.**
  v1 (section 13.2 de la synthèse) exigeait aussi une route « tout ce qui est non-lu, tous workspaces confondus »,
  justifiée à l'époque par l'absence de toute vue multi-projets dans l'outil précédent. Cette partie-là n'est
  **pas** restaurée : elle contredit l'isolation stricte par Workspace (1.3, 4.2), qui n'admet aucune exception,
  pas même pour le confort d'une vue agrégée. La requête « non-lu » reste donc scopée à un `workspace_id`, comme
  toute autre requête du système (20.4).
- **L'assignation atomique de tâche a disparu du texte explicite.** v1 (section 13.3) rendait explicite qu'une
  tâche est assignée à un seul agent dès sa création, jamais laissée « à prendre ». v2 ne le dit nulle part. v3 le
  restaure comme invariant de `Task` (4.6).
- **`ProviderProfile` a disparu comme entité du modèle de domaine.** v1 la définissait (capacités, format de
  prompt, règles d'approbation, modèle de sandbox). v2 parle de providers uniquement en principe abstrait
  (« Provider Agnostic ») sans plus jamais les modéliser comme catalogue interrogeable. C'est un problème concret :
  sans cette entité, rien ne peut porter l'état de disponibilité/quota par provider — exactement le point qui a
  posé le plus de problèmes réels (0.3). v3 la restaure et l'étend avec ce que l'exploitation réelle a enseigné.

### 0.3 Ce que ni v1 ni v2 n'avaient anticipé — appris en faisant tourner le système réel

Une implémentation du modèle v1/v2 a tourné en conditions réelles (agents Claude Code et Codex, plusieurs machines,
plusieurs semaines d'usage continu). Un ensemble de problèmes concrets, invisibles depuis un document de
conception pure, en est ressorti. Chacun devient une règle explicite dans ce document plutôt qu'un correctif isolé
et non documenté :

1. **La persistance partielle perd des données silencieusement.** Un mapper de repository qui ne réécrit qu'une
   liste choisie de champs (au lieu de l'agrégat complet) finit toujours par « oublier » un champ ajouté plus tard
   — vécu concrètement (un changement de provider qui semblait réussir puis revenait à l'ancienne valeur). Ce
   n'est pas un bug isolé, c'est une classe de bug qui se reproduit à chaque nouveau champ tant que la convention
   n'est pas « toujours persister l'agrégat complet ». → 5.18.
2. **Le rattachement d'une ressource à un workspace ne peut pas exiger la permission que cet acte établit
   lui-même.** Lier une machine à un workspace échouait systématiquement, car la vérification RBAC générique
   supposait que la ressource appartenait déjà au workspace — précisément ce que l'action de liaison est censée
   créer. Tout système à contrôle d'accès a besoin d'une exception de bootstrap explicite et étroite, pas d'un trou
   de permission généralisé. → 18.8.
3. **Le compte de ressources dégradées ne suffit pas ; il faut le détail.** « 21 commandes runtime bloquées » sans
   savoir lesquelles est une alerte qu'on ne peut pas agir dessus. La observabilité doit produire des listes
   nommées (quelle machine, depuis quand), pas seulement des compteurs. → 17.8.
4. **Une transition d'état déjà satisfaite, ou impossible parce que l'entité est dans un état terminal, ne doit
   jamais lever d'exception non gérée.** Arrêter une session déjà arrêtée faisait planter l'appelant au lieu de
   répondre proprement. Toute machine à états du système doit distinguer « déjà dans cet état » et « transition
   invalide depuis un état terminal » comme des résultats typés, jamais des crashs. → 22.6.
5. **Ré-acquérir un verrou qu'on détient déjà et entrer en conflit avec un autre détenteur sont deux chemins
   différents et doivent être testés séparément.** Un test qui utilisait le même acteur des deux côtés masquait
   totalement le vrai scénario de conflit. → 13.7.
6. **Un environnement isolé qui clone des identifiants une seule fois, au premier lancement, finit par diverger
   du compte source.** Un agent a échoué avec « OAuth access token has been revoked » alors que le compte réel
   était valide : la copie isolée de ses identifiants avait simplement été figée au premier lancement et jamais
   resynchronisée après une rotation de jeton côté hôte. Toute isolation de secret doit prévoir sa propre
   politique de fraîcheur, pas seulement sa politique d'isolement. → 18.9.
7. **Le quota d'un provider est une ressource de compte, partagée par construction entre tous les agents qui
   utilisent la même connexion — jamais une ressource par agent.** Confirmé en observant le même timestamp exact
   de réinitialisation de quota sur trois agents distincts utilisant le même compte. Modéliser le quota au niveau
   agent créerait une fausse impression d'isolement que le fournisseur ne respecte pas réellement. → 4.14, 7.14.
8. **La détection automatique de panne ne doit jamais faire confiance au contenu que l'agent génère lui-même.**
   Un détecteur de quota/panne qui scannait indifféremment stdout et stderr a un jour bloqué **tous** les agents
   d'un provider parce qu'un agent avait simplement écrit du code mentionnant « 429 » ou « rate limit » dans sa
   propre sortie. Seuls les signaux de niveau processus (stderr, code de sortie, erreurs d'outil structurées) sont
   dignes de confiance pour ce genre de décision globale. → 7.15.
9. **Un état effectif calculé sur plusieurs champs doit être remis en cohérence intégralement à chaque mutation,
   pas partiellement.** La réactivation manuelle d'un provider ne remettait à jour que le drapeau `available`,
   jamais `quotaUnavailableUntil`/`quotaReason` — rendant la réactivation silencieusement inopérante tant que la
   fenêtre de quota n'était pas naturellement expirée. → 4.14.
10. **Un système de réveil purement réactif finit par se taire pour de bon.** Un agent sans travail actionnable
    n'était plus jamais revisité — y compris pour signaler qu'il est inactif ou demander un prochain objectif.
    Toute boucle d'agents longue durée a besoin d'un second déclencheur, périodique, indépendant du travail en
    attente. → 9.16.
11. **Une reprise (`resume`) n'est valide que si le provider de la reprise correspond au provider qui a produit
    l'état repris.** Une session Claude ne peut pas reprendre un fil Codex et inversement — leurs identifiants de
    session, leur format de contexte, ne sont pas interchangeables. → 4.8, 4.13.
12. **Une contrainte imposée par le backend doit être visible avant que l'utilisateur ne s'y heurte, pas seulement
    après.** Un bouton « Reprendre » identique sur toutes les sessions, alors que seules les sessions manager sont
    reprenables par un humain par conception, se lisait comme un bug alors que c'était un comportement voulu mais
    invisible. → 20.6.

Ces douze points ne sont pas des anecdotes : ce sont des règles de conception qui, si elles avaient figuré dans v1
ou v2 dès le départ, auraient évité les incidents correspondants. Ils sont intégrés directement dans les chapitres
concernés ci-dessous plutôt que laissés en annexe.

### 0.4 La correction de vision qui traverse tout le document

Une clarification de fond, obtenue après relecture de v2 avec l'opérateur du produit, recadre l'ensemble : **le but
premier de Spline est la collaboration et l'orchestration d'agents pour accomplir des tâches en général — pas la
supervision, et pas le développement logiciel spécifiquement.** Le code et Git sont le cas d'usage le mieux couvert
aujourd'hui, pas une frontière du système. En corollaire, deux exigences deviennent structurelles plutôt
qu'optionnelles :

- **Multi-machine dès la V1**, pas une extension future : un même opérateur peut posséder plusieurs machines et
  veut que Spline les exploite toutes, avec plusieurs agents actifs simultanément sur des machines différentes.
- **Extensibilité communautaire dès la V1** : le dépôt est public, et l'ambition est un écosystème ouvert et
  évolutif, à la manière d'OpenClaw, pas un outil figé mono-équipe. Le noyau ne doit jamais avoir besoin d'être
  modifié pour qu'un nouveau domaine de travail (au-delà du logiciel) devienne possible.

Ces deux points structurent le chapitre 1 (Vision) et le chapitre 19 (Extensibilité & Communauté), et infusent
tout le Domain Model (chapitre 4), où le Repository Engine devient un Engine parmi d'autres possibles, pas le
centre du système.

---

## 1. Vision

Spline est une plateforme de coordination, d'orchestration et de collaboration permettant à des agents IA et des
humains de travailler efficacement ensemble pour accomplir des tâches, quel que soit leur domaine.

Spline ne cherche pas à remplacer les fournisseurs de modèles de langage.

Spline fournit une infrastructure commune permettant à plusieurs agents, provenant de fournisseurs différents, de
travailler ensemble selon un protocole partagé, un état partagé et des règles d'exécution déterministes.

Le système agit comme le **Control Plane** d'un environnement de travail agentique.

Les agents deviennent des workers spécialisés capables de coopérer sur un même objectif.

**Le développement logiciel est le cas d'usage de référence de Spline — le mieux couvert, le plus abouti — mais ce
n'est qu'un cas d'usage.** Rien dans le noyau (Workspace, Goal, Task, Run, Agent, collaboration) ne suppose que le
travail produit du code ou touche à Git. Ce qui est spécifique au logiciel (dépôts, branches, merges) vit dans un
Engine installable (chapitre 8), pas dans le noyau lui-même.

### 1.1 Vision long terme

Spline doit devenir le système d'exploitation du travail agentique. De la même manière que Kubernetes orchestre
des conteneurs, Spline orchestre des agents.

Le système doit permettre :

- plusieurs agents
- plusieurs fournisseurs
- plusieurs machines
- plusieurs domaines de travail (le logiciel et Git en sont l'exemple de référence, pas une limite)
- plusieurs utilisateurs
- plusieurs organisations

sans perte de cohérence.

Le multi-machine n'est pas une extension future : c'est un besoin immédiat. Un même opérateur peut posséder
plusieurs machines locales et veut que Spline les mette toutes à profit, avec plusieurs agents actifs simultanément
sur des machines différentes, coordonnés par le même Control Plane.

### 1.2 Ce que Spline n'est pas

Spline n'est pas :

- un LLM
- un chatbot
- un IDE
- un gestionnaire Git
- un framework d'agents
- un orchestrateur de prompts
- un outil de développement logiciel exclusivement — le logiciel est son cas d'usage le plus mature, pas sa
  frontière

Ces composants peuvent être intégrés à Spline mais ne définissent pas son identité.

### 1.3 Principes fondamentaux

**State First**
Le système repose sur un état partagé persistant. Les agents ne doivent jamais être la source de vérité.

**Control Plane**
Toutes les décisions critiques passent par le Control Plane. Aucun agent ne décide seul de l'état global.

**Provider Agnostic**
Tous les fournisseurs sont considérés comme interchangeables au niveau du protocole — mais jamais au niveau de
l'état d'exécution qu'ils produisent (0.3.11) : un Run reste rattaché au provider qui l'a produit.

**Domain Agnostic**
Le noyau (Workspace, Goal, Task, Run, Attempt, Validation, Policy, collaboration) ne suppose aucun domaine de
travail particulier. Tout ce qui est spécifique à un domaine — Git, design, données, ou tout autre futur domaine —
est fourni par un Engine ou un Tool installable (chapitre 19), jamais par une hypothèse codée en dur dans le noyau.
Le logiciel est le premier Engine, pas un privilège architectural.

**Community Extensible**
Spline est un projet ouvert. Un contributeur externe doit pouvoir publier un nouvel Engine, un nouvel Tool, un
nouveau type de validation ou un modèle de politique sans modifier le noyau ni attendre une release du cœur du
produit. L'extensibilité est une propriété architecturale dès la V1, pas une promesse reportée.

**Deterministic Infrastructure**
Les modèles sont probabilistes. L'infrastructure qui les entoure doit être déterministe — y compris ses
mécanismes internes de détection de panne, qui ne doivent jamais dépendre d'une interprétation heuristique du
contenu produit par un modèle (0.3.8).

**Human Supervision**
L'humain peut intervenir à tout instant. Le système ne suppose jamais une autonomie absolue. Une contrainte que le
backend impose de façon permanente à l'humain (ex. qui peut reprendre quelle session) doit être visible avant
d'être heurtée, pas seulement révélée par un échec (0.3.12).

**Crash Recovery**
Tout composant doit pouvoir disparaître sans provoquer de perte définitive d'information.

**Protocol Driven**
Les agents collaborent selon un protocole imposé. Jamais selon des conventions implicites.

**Workspace Isolation**
Chaque workspace possède :

- son état
- ses agents
- ses secrets
- ses ressources
- ses politiques
- ses extensions installées

**Goal Driven**
Un projet progresse vers des résultats. Pas uniquement vers des tâches.

**Observable**
Chaque action doit pouvoir être observée. Chaque décision doit pouvoir être expliquée. Chaque événement doit être
traçable. Un état dégradé doit toujours être rapporté avec son détail nominatif, jamais seulement son compte
(0.3.3).

---

## 2. Scope

### Inclus V1

- Control Plane
- Workspace Management
- Goal Management
- Task Graph, avec assignation atomique dès la création (0.2, 4.6)
- Agent Management
- Provider Catalog (`ProviderProfile`), avec disponibilité et quota tenus cohérents comme un seul état dérivé
  (0.3.9, 4.14)
- Runtime local
- Multi Provider
- Multi Machine — exigence immédiate, pas différée (1.1)
- Git Integration (fournie comme Engine, voir chapitre 8)
- Artifact Management
- Validation Engine
- Resource Locks, avec chemins distincts pour réacquisition idempotente et conflit réel (0.3.5, 13.7)
- Audit
- Notification System avec fan-out par destinataire réel et accusé de réception individuel (0.2, 4.18-4.19)
- Human Review
- Process Registry
- Event Bus, avec accusé de réception séparé de l'événement lui-même quand nécessaire (0.2, 4.20)
- Local Worker Runtime
- Runtime Health Aggregate — détail nominatif des ressources dégradées, pas seulement des compteurs (0.3.3, 17.8)
- Extension Registry — le mécanisme d'installation/publication d'Engines, Tools, types de validation et modèles de
  politiques (chapitre 19) est une exigence d'architecture V1, même minimal.

### Exclus V1

- Auto Scaling Cloud
- Marketplace grand public (vitrine, découverte, notation, paiement) — le **mécanisme** d'extension (Extension
  Registry) est en V1 ; la **vitrine** communautaire polie est un chantier produit séparé, ultérieur
- Distributed Scheduling mondial
- Federated Clusters
- Self Training Models
- Autonomous Long Running Organizations
- Entraînement de modèles
- Éditeur de code natif complet
- Autonomie totale sans supervision humaine

---

## 3. Architecture Overview

Spline est organisé autour de deux catégories de composants. Le premier groupe décide. Le second exécute.

```text
                              User
                               │
                     Web / Mobile / API
                               │
                         Control Plane
        ┌────────────────────────────────────────────┐
        │  Workspace Service       Goal Engine        │
        │  Task Graph Engine       Scheduler           │
        │  Validation Engine       Lock Manager        │
        │  Audit                   Artifact Service    │
        │  Event Bus                Notification Svc   │
        │  Policy Engine             Extension Registry │
        │  Provider Catalog          Runtime Health     │
        └────────────────────────────────────────────┘
                               │
                     Runtime Coordination
        ┌───────────────┬───────────────┬───────────────┐
        │               │               │
    Worker A         Worker B        Worker C
    (Machine 1)      (Machine 2)     (Machine 3)
        │               │               │
   Claude Code        Codex        Gemini CLI
        │               │               │
      Git             Docker        Processes
   (via Engine)
```

Le Control Plane ne réalise jamais directement le travail. Il organise. Les Workers exécutent.

### 3.1 Couche Produit

**Applications :** Web, Mobile, API.

**Responsabilités :** monitoring, validation, administration, création de projets, supervision.

### 3.2 Control Plane

Le Control Plane est le cerveau du système. Il possède la totalité de l'état métier.

Il décide : quelle tâche existe, qui peut l'exécuter, quelles ressources sont disponibles, quels locks existent,
quels objectifs sont atteints.

Le Control Plane ne génère jamais de code.

### 3.3 Worker Runtime

Le Worker Runtime est installé sur une machine. Il lance les agents, lance les commandes, pilote les Engines
installés, contrôle Docker, gère les processus, publie les événements, envoie les heartbeats.

Un worker peut exécuter plusieurs agents. Un opérateur peut faire tourner plusieurs workers sur plusieurs machines
qu'il possède, tous rattachés au même Control Plane.

### 3.4 Agent Runtime

Chaque agent est exécuté dans une session indépendante, avec un contexte, un provider, un workspace, un
environnement, un lease, un état. Une session n'est jamais la source de vérité.

### 3.5 Repository Engine (Engine de référence)

Lorsqu'une tâche implique du code, Git est géré par le Repository Engine — le premier Engine fourni nativement
(chapitre 8, chapitre 19), pas le cœur du système. Une tâche qui ne relève pas du logiciel n'active simplement pas
cet Engine.

### 3.6 Validation Engine

Une tâche n'est jamais terminée parce qu'un agent le déclare. Elle est terminée lorsque les validations sont
satisfaites, les tests passent, les politiques sont respectées, les approbations sont obtenues.

### 3.7 Event Bus

Toutes les communications passent par un bus d'événements. Les événements représentent des faits. Jamais des
intentions.

### 3.8 Scheduler

Le Scheduler décide quel worker reçoit une tâche, quand elle démarre, quand elle est reprise, quand elle est
abandonnée — et, distinctement, quand un agent inactif doit être revisité même sans travail en attente (0.3.10,
9.16). Le Scheduler ne réalise aucune exécution.

### 3.9 Policy Engine

Le Policy Engine applique les règles (interdiction de pousser sur main, validation obligatoire, coût maximum,
timeout, approbation humaine) avant chaque action critique.

### 3.10 Observability

Chaque composant publie logs, métriques, traces, événements. Un état dégradé se rapporte toujours avec son détail
nominatif (0.3.3).

### 3.11 Provider Catalog

Un catalogue global (pas scopé Workspace) de providers connus, avec leurs capacités et leur état de disponibilité
courant. Le quota est une ressource de compte, partagée par tous les agents utilisant la même connexion — le
catalogue est donc délibérément global, jamais par agent (0.3.7, 4.14).

### 3.12 Extension Registry

Le Control Plane héberge un registre d'Engines, de Tools, de types de validation et de modèles de politiques
publiés par la communauté. Une Organisation ou un Workspace installe explicitement ce dont il a besoin.

### 3.13 Source of Truth

La source de vérité est toujours le Control Plane. Jamais le LLM, Git, Redis, le Runtime, le Worker, ou un Engine
tiers. Ces composants représentent un état dérivé, reconstructible. Le Control Plane ne peut pas être reconstruit
à partir d'eux.

---

## 4. Domain Model

Le Domain Model définit les objets métier fondamentaux de Spline. Aucune logique métier ne doit dépendre
directement des providers IA. Aucune entité du noyau, à l'exception de Repository et Worktree (qui appartiennent
explicitement au Repository Engine, pas au noyau), ne doit dépendre d'un domaine de travail particulier.

### 4.1 Hiérarchie

```text
Provider Catalog (global — chapitre 3.11)
Extension Registry (global — chapitre 19)

Organization
└── Workspace
    ├── Repository (optionnel — fourni par le Repository Engine, actif seulement si installé et utilisé)
    ├── Goal
    │   ├── Goal
    │   └── Task
    │       ├── Run
    │       │   ├── Attempt
    │       │   └── Validation
    │       ├── Artifact
    │       ├── Decision
    │       └── Blocker
    │
    ├── WorkerNode
    │   ├── AgentSession
    │   ├── RuntimeProcess
    │   └── LocalMachine
    │
    ├── Extension (Engines, Tools, Validation Types, Policy Templates installés)
    ├── Event
    │   └── EventReceipt (optionnel, par type d'event qui en a besoin)
    ├── Notification
    │   └── NotificationRecipient (une ligne par destinataire réel, résolue à la création)
    ├── ResourceLock
    ├── Policy
    └── AuditEntry
```

### 4.2 Workspace

Le Workspace représente l'unité d'isolation principale. Toutes les ressources appartiennent à exactement un
Workspace. Aucun état métier n'est partagé directement entre deux Workspaces — **sans exception**, y compris pour
les notifications : la requête « non-lu pour moi » d'un destinataire reste scopée à un `workspace_id`, comme toute
autre requête (4.19, 20.4). Un client qui veut une vue agrégée interroge chaque Workspace séparément ; ce n'est
jamais le rôle du Control Plane de l'agréger pour lui.

**Champs**

- id
- organization_id
- name
- slug
- description
- status
- settings
- policies
- repositories (peut être vide)
- goals
- workers
- artifacts
- notifications
- installed_extensions
- created_at
- updated_at

**Statuts** — active, archived, paused, deleted.

**Invariants**

- un Workspace possède un propriétaire
- un Workspace possède au moins une politique
- un Workspace possède un audit permanent
- les ressources d'un Workspace sont isolées
- un Workspace n'a besoin d'aucun Repository pour être valide

### 4.3 Repository

Le Repository représente un dépôt Git. C'est une entité fournie par le Repository Engine, pas par le noyau : elle
n'existe que pour les Workspaces qui utilisent cet Engine. Git n'est jamais piloté directement par un agent.

**Champs** — id, workspace_id, provider, remote_url, default_branch, credential_ref, mirror_path, status,
created_at, updated_at.

**Relations** — un Repository possède plusieurs branches, plusieurs worktrees, plusieurs validations, plusieurs
artefacts.

### 4.4 Worktree

Un Worktree représente une copie de travail isolée, fournie par le Repository Engine pour les tâches qui touchent
à un dépôt. Deux tâches ne partagent jamais le même environnement Git. Une tâche sans Repository n'a pas de
Worktree — son isolation reste garantie par ailleurs (sandbox de session, chapitre 7.9).

**Champs** — id, repository_id, task_id, worker_id, path, base_commit, branch, status.

**Statuts** — preparing, ready, running, validating, archived.

**Invariants** — un Worktree appartient exactement à une tâche, un repository, un worker.

### 4.5 Goal

Un Goal représente un résultat observable. Un Goal décrit ce qui doit être atteint. Jamais comment.

**Champs** — id, workspace_id, parent_goal_id, title, description, success_criteria, priority, owner, progress,
status, created_at, updated_at.

**Statuts** — planned, active, blocked, review, completed, cancelled.

**Invariants**

- un Goal possède des critères de succès
- un Goal peut contenir plusieurs tâches et plusieurs sous-objectifs
- un Goal ne peut être terminé sans validation
- un Goal ne présuppose aucun domaine de travail

### 4.6 Task

Une Task représente une unité atomique de travail. Une Task possède un seul responsable. Les collaborateurs
éventuels interviennent via des tâches séparées.

**Champs**

- id
- workspace_id
- goal_id
- repository_id (nullable — présent uniquement si la tâche utilise le Repository Engine)
- title
- description
- priority
- owner
- state
- acceptance_criteria
- dependencies
- estimated_cost
- estimated_duration
- created_at
- updated_at

**Statuts** — planned, ready, assigned, running, blocked, validating, completed, failed, cancelled.

**Invariants**

- une Task possède un Goal, un propriétaire, un état, des critères d'acceptation
- une Task reste valide et exécutable sans `repository_id`
- **une Task est assignée à un seul agent ou humain dès sa création — jamais laissée dans un état « à prendre »
  où plusieurs acteurs pourraient se porter volontaires simultanément.** L'assignation initiale peut changer plus
  tard via une réassignation explicite, mais il n'existe à aucun instant de fenêtre où une Task existe sans
  assignee défini (restauré de v1 §13.3, régressé dans v2 — voir 0.2)

### 4.7 Run

Un Run représente une exécution logique. Une même tâche peut être exécutée plusieurs fois. Chaque tentative crée un
nouveau Run.

**Champs** — id, task_id, worker_id, status, started_at, finished_at.

**Statuts** — pending, running, validating, completed, failed.

### 4.8 Attempt

Une Attempt représente une tentative d'exécution. Elle permet les retries, les reprises, les statistiques.

**Champs** — id, run_id, number, provider, model, prompt_version, token_usage, cost, duration, outcome.

**Invariant de reprise** — une Attempt (ou la session qui en découle) ne peut être reprise que par une exécution
utilisant **le même provider** que celui qui l'a produite. Les états de session, identifiants de fil de discussion
et formats de contexte d'un provider ne sont pas interchangeables avec ceux d'un autre. Une tentative de reprise
avec un provider différent doit être rejetée explicitement (`AttemptNotResumableError`), jamais silencieusement
acceptée puis échouée en aval (0.3.11).

### 4.9 Validation

Une Validation représente une preuve. Une tâche n'est jamais terminée sans preuve.

**Champs** — id, task_id, validation_type, status, output, executed_by, created_at.

**Types** — build, unit_test, integration_test, lint, security_scan, human_review, policy_check, et tout autre type
publié via l'Extension Registry (chapitre 19).

### 4.10 Artifact

Un Artifact représente un objet produit : fichier, capture, log, rapport, diff, document, décision, archive.

**Champs** — id, workspace_id, task_id, repository_id, type, version, checksum, storage_ref, metadata.

### 4.11 WorkerNode

Le WorkerNode représente une machine d'exécution.

**Champs** — id, hostname, labels, architecture, operating_system, capabilities, health, last_heartbeat, status.

**Statuts** — online, offline, draining, maintenance.

### 4.12 AgentSession

Une AgentSession représente une instance vivante d'un agent. Une session est éphémère. L'Agent est permanent.

**Champs** — id, agent_id, worker_id, provider, model, workspace_id, state, lease_id, started_at.

**Statuts** — starting, idle, running, waiting, stopped, crashed.

**Invariant de transition** — toute tentative de faire transiter une session déjà dans l'état cible, ou dans un état
terminal incompatible (ex. « stop » sur une session déjà `stopped`/`crashed`), retourne un résultat typé
(`AlreadyInState` / `InvalidTerminalTransition`), jamais une exception non gérée (0.3.4, 22.6).

### 4.13 Lease

Le Lease protège une exécution. Si le Worker disparaît, le Lease expire. La tâche peut être reprise — par le même
provider que celui qui détenait le Lease (4.8).

**Champs** — id, owner, resource, acquired_at, expires_at, renewed_at.

### 4.14 ProviderProfile (Provider Catalog)

Représente un fournisseur de modèle connu du système (Claude, Codex, Gemini, ou tout autre). C'est un **catalogue
global**, jamais scopé à un Workspace : le quota et la disponibilité d'un provider sont une ressource de compte,
partagée par construction entre tous les agents qui utilisent la même connexion sous-jacente — les modéliser par
agent créerait une fausse impression d'isolement que le fournisseur ne respecte pas réellement (0.3.7). Cette
entité existait dans v1 et avait disparu du modèle de domaine de v2 (0.2) ; elle est restaurée ici, enrichie de ce
que l'exploitation réelle a montré nécessaire.

**Champs**

- id
- provider
- capabilities
- prompt_format
- approval_rules
- hook_support
- sandbox_model
- output_schema
- available (booléen, positionné manuellement par un opérateur)
- quota_unavailable_until (nullable)
- quota_reason (nullable)

**Disponibilité effective (propriété calculée, jamais un champ stocké séparément)**

```text
effective_available = available AND (quota_unavailable_until IS NULL OR quota_unavailable_until < now())
```

**Invariant de cohérence** — toute mutation qui affecte la disponibilité effective doit mettre à jour les trois
champs contribuant de façon cohérente. Une réactivation manuelle (`available = true`) doit aussi effacer
`quota_unavailable_until` et `quota_reason` — sinon elle est silencieusement un no-op tant que la fenêtre de quota
n'a pas naturellement expiré, un bug réellement vécu (0.3.9). À l'inverse, une désactivation manuelle
(`available = false`) ne doit jamais fabriquer une `quota_reason` qu'elle n'a pas constatée.

**Source de détection du quota** — un mécanisme automatique qui détecte l'épuisement de quota ou une panne
d'authentification ne doit examiner que des signaux de niveau processus (stderr, code de sortie, erreurs d'outil
structurées), jamais le contenu généré par l'agent lui-même (stdout, sortie conversationnelle) — un agent qui
écrit simplement du code mentionnant « 429 » ou « rate limit » ne doit jamais déclencher un verrouillage global du
provider (0.3.8, 7.15).

### 4.15 RuntimeProcess

Représente un processus système (serveur, docker, npm, go run...).

**Champs** — id, worker_id, workspace_id, pid, command, cwd, status, ports, owner.

### 4.16 ResourceLock

Protège une ressource précise. Jamais une tâche complète.

**Types** — process, file, directory, repository, branch, port, environment.

**Champs** — id, resource, owner, lease, reason, acquired_at, expires_at.

**Deux chemins distincts (0.3.5)** — ré-acquérir un lock qu'on détient déjà (même acteur) est idempotent et
retourne succès sans recréer d'état ; acquérir un lock détenu par un acteur différent est un conflit réel
(`Waiting`/`Rejected` selon la politique). Ce sont deux scénarios différents dans le code et dans les tests — un
test qui utilise le même acteur des deux côtés ne couvre jamais le second (13.7).

### 4.17 Decision

Une Decision représente un choix métier, avec sa justification.

**Champs** — id, workspace_id, task_id, author, rationale, alternatives, outcome, confidence.

### 4.18 Notification

Représente le message ou l'alerte parent, qu'il s'agisse d'un message de chat ordinaire entre agents ou d'une
alerte système — les deux partagent le même modèle (unification actée en v1 §13.1, conservée ici). **Une
Notification n'a pas de champ de lecture propre** : la lecture se fait toujours par destinataire (4.19).

**Champs** — id, workspace_id, kind (`chat_message` | `system_alert`), task_id (ou thread_id, si `chat_message`),
from_agent_id (si `chat_message`), title, body, payload, scope (`direct` | `broadcast`), created_by, created_at.

### 4.19 NotificationRecipient

Une ligne **par destinataire réel**, générée à la création de la Notification — jamais recalculée à la lecture.
Cette entité avait disparu de v2 (0.2) ; elle est restaurée à l'identique de sa forme v1, avec la même justification
opérationnelle : sans elle, un `ack` sur un message broadcast ne peut pas avoir de sens individuel, et c'est
exactement ce qui a cassé en production avec l'outil précédent.

Quand `scope = broadcast`, le système résout **immédiatement** la liste des agents actifs concernés et crée une
ligne par agent — `to: all` n'est jamais une chaîne réinterprétée différemment à chaque requête de lecture.

**Champs** — id, notification_id, recipient_type, recipient_id, delivery_status, delivered_at, read_at,
acknowledged_at, action_taken_at, last_seen_at, failure_reason.

**Statuts de destinataire** — pending, delivered, seen, acknowledged, acted_on, failed.

### 4.20 Event

Un Event représente un fait. Jamais une intention. **Un Event n'a pas de champ de lecture propre** — si un type
d'événement a besoin d'un accusé de réception par agent (ex. `agent.validation_request`), c'est l'entité séparée
`EventReceipt` ci-dessous, jamais un attribut sur `Event` lui-même. Cette distinction, actée en v1, avait disparu
de v2 (0.2) et est restaurée.

**Exemples** — TaskStarted, TaskCompleted, TaskFailed, WorkerOffline, LeaseExpired, ValidationSucceeded,
ValidationFailed, ArtifactCreated, RepositoryUpdated, MergeCompleted, ExtensionInstalled, ExtensionPublished.

**Champs** — id, workspace_id, type, severity, actor, target, payload, created_at.

### 4.21 EventReceipt

Prise de connaissance d'un Event par un agent, créée seulement pour les types d'événement qui en ont besoin.

**Champs** — id, event_id, actor_type, actor_id, status, seen_at, acknowledged_at, acted_at.

### 4.22 Blocker

Représente un obstacle. Une tâche bloquée ne progresse plus.

**Types** — technical, dependency, approval, infrastructure, human, external.

### 4.23 AuditEntry

Toute action importante génère une entrée d'audit. L'audit est immuable.

**Champs** — id, actor, action, target, before, after, timestamp, signature.

### 4.24 Invariants Globaux

- Une tâche possède exactement un propriétaire, dès sa création (4.6).
- Un Worktree appartient exactement à une tâche.
- Une Validation appartient exactement à un Run.
- Un Lease protège exactement une ressource.
- Un Lock ne peut exister sans Lease.
- Une Session appartient exactement à un Worker.
- Un Worker peut exécuter plusieurs Sessions.
- Une tâche n'est jamais terminée sans Validation.
- Le Control Plane reste toujours la source de vérité.
- Aucun provider IA ne peut modifier directement l'état métier.
- Une Task, un Goal ou un Workspace restent entièrement valides sans aucun Repository — le noyau ne dépend
  d'aucun domaine de travail particulier.
- Un Engine ou un Tool communautaire ne reçoit jamais plus de confiance qu'un Engine de référence.
- Une Attempt n'est reprise que par le provider qui l'a produite (4.8).
- Une Notification broadcast résout ses destinataires à la création, jamais à la lecture (4.19).
- Un Event ne porte pas de champ de lecture ; un EventReceipt séparé le fait si nécessaire (4.20-4.21).
- Un état effectif calculé sur plusieurs champs (ex. disponibilité provider) est remis en cohérence
  intégralement à chaque mutation qui le touche, jamais partiellement (4.14).

---

## 5. Control Plane

Le Control Plane constitue le cœur de Spline. Aucun composant ne peut modifier directement l'état métier sans
passer par lui. Il ne réalise jamais le travail opérationnel : il décide, les Workers exécutent.

### 5.1 Responsabilités

Workspaces, Repositories (quand utilisés), Goals, Tasks, orchestration des Workers, allocation des ressources,
coordination des agents, validation, audit, notifications, politiques, événements, persistance, registre des
extensions installées, catalogue des providers.

### 5.2 Principes

Le Control Plane est stateless vis-à-vis des providers, stateful vis-à-vis du domaine métier. Il ne connaît jamais
les prompts internes d'un provider, les conversations internes d'un LLM, les détails d'implémentation d'un
runtime, d'un Engine ou d'un Tool tiers. Il connaît les capacités, les états, les tâches, les résultats, et le
contrat déclaré par chaque Extension installée.

### 5.3 Architecture

```text
                     API
                      │
                      ▼
                Control Plane
                      │
    ├──────── Workspace Service
    ├──────── Repository Service (Engine)
    ├──────── Goal Engine
    ├──────── Task Engine
    ├──────── Scheduler
    ├──────── Validation Engine
    ├──────── Policy Engine
    ├──────── Lock Manager
    ├──────── Notification Service
    ├──────── Artifact Service
    ├──────── Audit Service
    ├──────── Extension Registry
    ├──────── Provider Catalog Service
    ├──────── Runtime Health Service
    └──────── Event Bus
```

### 5.4 Workspace Service

Création, archivage, duplication, configuration, permissions, règles. Ne gère jamais les tâches.

### 5.5 Repository Service

Enregistre les dépôts, crée les worktrees, suit les branches et les commits, prépare les environnements Git,
publie les changements. Ne réalise jamais de merge. N'est sollicité que pour les Workspaces qui utilisent le
Repository Engine.

### 5.6 Goal Engine

Création des objectifs, hiérarchie, progression, dépendances, calcul du pourcentage, clôture. Ne connaît jamais les
providers, ni le domaine de travail des tâches qu'il suit.

### 5.7 Task Engine

Création, assignation atomique dès la création (4.6), dépendances, blocages, exécution, validation. Une Task
appartient toujours à un Goal.

### 5.8 Scheduler

**Entrées** — workers disponibles, capacités, coût, priorité, dépendances.

**Sorties** — assignation, attente, reprise, annulation.

Détail du fonctionnement au chapitre 9, y compris le double déclencheur réactif/périodique (9.16).

### 5.9 Validation Engine

Une tâche est validée uniquement si toutes les validations requises réussissent, aucune politique n'est violée,
toutes les approbations existent.

### 5.10 Policy Engine

Interdit (push sur main, suppression d'une branche, accès production, modification des secrets, installation
d'une extension non signée) et oblige (review, lint, tests, couverture minimale) avant chaque action critique.

### 5.11 Lock Manager

Garantit l'exclusivité sur fichiers, branches, ports, processus, environnements. Les locks sont toujours
temporaires et expirent. Voir 4.16 pour la distinction réacquisition/conflit.

### 5.12 Artifact Service

Stockage logique, version, relations, recherche, historique. Un Artifact n'est jamais supprimé sans audit.

### 5.13 Notification Service

Messages, alertes, demandes de validation, diffusion, accusés — toujours résolus par destinataire réel (4.19). Ne
transporte jamais les événements système bruts (ceux-là passent par l'Event Bus, 5.15).

### 5.14 Audit Service

Chaque modification importante génère une entrée. Aucune entrée ne peut être supprimée.

### 5.15 Event Bus

Diffusion, persistance, retries, ordering, replay.

### 5.16 Extension Registry Service

Catalogue les Engines, Tools, types de validation et modèles de politiques publiés ; vérifie la conformité au
contrat d'Extension (19.2) ; gère l'installation/désinstallation ; vérifie les signatures et les versions.

### 5.17 Provider Catalog Service

Tient à jour le catalogue global de providers (4.14) : capacités déclarées, disponibilité effective, quota. C'est
le seul service autorisé à écrire `available`/`quota_unavailable_until`/`quota_reason`, et il applique
systématiquement l'invariant de cohérence de 4.14 — jamais une mutation partielle.

### 5.18 Runtime Health Service

Calcule et expose l'état de santé runtime : machines/sessions/commandes en retard de heartbeat, avec le détail
nominatif de chacune (identifiant, depuis quand), jamais seulement un compte (0.3.3, 17.8).

### 5.19 Persistance — discipline de sauvegarde complète

**Toute implémentation de repository doit persister l'agrégat complet à chaque sauvegarde, jamais une liste
choisie de champs.** Une sauvegarde partielle (ex. une clause `UPDATE` qui n'énumère qu'un sous-ensemble de
colonnes) finit toujours par « oublier » silencieusement un champ ajouté plus tard à l'entité, puisque rien
n'oblige à mettre à jour la liste en même temps que le modèle évolue — un bug de cette forme précise a été observé
et corrigé, systématiquement, dans quatorze repositories différents du même codebase avant que cette règle ne soit
formalisée (0.3.1). C'est une discipline d'implémentation, pas un détail : elle doit être vérifiable en revue de
code (« ce repository sauvegarde-t-il l'objet complet ou une sélection ? ») pour tout nouveau module.

### 5.20 Source de vérité

Le Control Plane est la seule autorité. Le Runtime ne peut jamais modifier directement une Task, un Goal, un Lock,
une Validation. Il soumet une requête. Le Control Plane décide.

---

## 6. Worker Runtime

Le Worker Runtime est le composant installé sur une machine. Il exécute les décisions prises par le Control Plane.

### 6.1 Responsabilités

Lance les agents, exécute les commandes, pilote les Engines installés, contrôle Docker, surveille les processus,
remonte les événements, renouvelle les leases, envoie les heartbeats.

### 6.2 Cycle de vie

```text
OFFLINE → CONNECTING → REGISTERING → READY → RUNNING → DRAINING → OFFLINE
```

### 6.3 Enregistrement

Au démarrage, un Worker envoie hostname, architecture, OS, mémoire, CPU, GPU, runtimes disponibles, providers
disponibles, extensions disponibles localement, version. Le Control Plane retourne un Worker ID, les Policies, les
Workspaces autorisés.

**Rattachement à un Workspace** — l'action qui lie une machine à un Workspace ne peut pas exiger, comme
précondition, que la machine appartienne déjà à ce Workspace : c'est précisément ce que l'action établit. Cette
opération suit l'exception de bootstrap décrite en 18.8, jamais une vérification RBAC générique.

### 6.4 Heartbeat

Chaque Worker publie régulièrement charge CPU, mémoire, disque, tâches, sessions, santé. Sans heartbeat avant
expiration du délai, le Worker est considéré comme indisponible (seuils précis en 17.7).

### 6.5 Lease

```text
Worker → Acquire Lease → Execute → Renew Lease → Release Lease
```

Si le Lease expire, la tâche est suspendue, le lock est libéré, le Scheduler peut réassigner — au même provider
que celui qui détenait le Lease si une reprise est tentée (4.8).

### 6.6 Crash Recovery

Le Control Plane détecte l'absence, expire les leases, marque les sessions perdues, conserve les artefacts,
replace les tâches dans la file. Aucune tâche ne doit disparaître.

### 6.7 Isolation

Chaque tâche possède son environnement, ses variables, ses logs, ses processus, son Worktree (si applicable). Deux
tâches ne partagent jamais un environnement.

### 6.8 Runtime API

ExecuteTask, CancelTask, Heartbeat, AcquireLease, ReleaseLease, PublishEvent, UploadArtifact, ListProcesses,
KillProcess, CreateWorktree, DeleteWorktree, InvokeEngine, InvokeTool.

### 6.9 Runtime State

Le Runtime maintient uniquement un état local. En cas de divergence, le Control Plane fait autorité.

### 6.10 Sécurité

Le Runtime ne reçoit jamais les secrets des autres Workspaces, les politiques des autres organisations, les
tâches étrangères. Toutes les autorisations sont limitées au Workspace courant, y compris pour les Extensions
installées.

---

## 7. Agent Runtime

L'Agent Runtime constitue l'interface entre le provider IA et Spline. Il traduit les décisions du Control Plane en
actions exécutables. Il ne possède jamais l'état métier : il exécute.

### 7.1 Responsabilités

Démarrer une session, préparer le contexte, charger les outils, communiquer avec le provider, exécuter les
actions, produire des artefacts, publier les événements, terminer proprement la session.

### 7.2 Cycle de vie

```text
CREATED → INITIALIZING → SYNCING → READY → EXECUTING → WAITING → EXECUTING → COMPLETED → TERMINATED
```

En cas d'erreur : `EXECUTING → FAILED → RETRYING → EXECUTING`, ou `FAILED → TERMINATED`.

### 7.3 Initialisation

Récupère configuration, politiques, permissions, objectifs, tâche, artefacts nécessaires, extensions installées
pertinentes. Ne démarre jamais sans synchronisation complète.

### 7.4 Synchronisation

Récupère Workspace State, Task State, Goal State, Locks, Policies, Repository State (si applicable), Validation
State. L'agent ne peut agir qu'après cette étape.

### 7.5 Contexte

```text
Workspace Context → Project Context → Goal Context → Task Context → Execution Context
```

Chaque couche enrichit la suivante. Le contexte est reconstruit à chaque exécution.

### 7.6 Mémoire

Workspace Memory, Goal Memory, Task Memory, Session Memory (temporaire, supprimée en fin de session) — détail au
chapitre 16.

### 7.7 Outils

Fournis par le Runtime, en natif (Terminal, Docker, Browser, Filesystem, Search, Diff, Logs) ou via des Tools
installés depuis l'Extension Registry (Git via le Repository Engine, tout serveur MCP publié par la communauté).
Jamais appelés directement — toujours via le Runtime.

### 7.8 Permissions

Chaque outil possède ses permissions, vérifiées avant chaque appel, y compris pour les outils fournis par une
Extension.

### 7.9 Sandbox

Isolation fichiers, variables, processus, réseau, worktree (si applicable). Un Tool ou Engine communautaire
s'exécute sous la même isolation qu'un composant natif.

### 7.10 Prompts

Construit à partir du Workspace, du Goal, de la Task, des Policies, des Artefacts, des Capacités, des Extensions
actives. Considéré comme un artefact dérivé.

### 7.11 Réponses

Pour modifier le système, l'agent doit produire une Action : PublishEvent, CreateArtifact, UpdateTask,
AcquireLock, ReleaseLock, StartProcess, StopProcess, InvokeTool.

### 7.12 Validation d'action

Avant exécution : validation syntaxique, permissions, politiques, ressources.

### 7.13 Fin de session

Une session se termine à la fin de la tâche, sur erreur fatale, timeout, annulation utilisateur, ou disparition du
Worker. Toutes les ressources sont libérées.

### 7.14 Identifiants isolés — fraîcheur obligatoire

Quand une session s'exécute dans un environnement isolé (sandbox), ses identifiants de provider (jetons OAuth,
clés) y sont nécessairement copiés. **Cette copie doit être resynchronisée dès que la copie source (côté hôte)
change** — notamment lors d'une rotation de refresh-token — et non figée au premier lancement. Une copie jamais
resynchronisée finit par échouer avec des erreurs qui ressemblent à un problème de compte (« jeton révoqué ») alors
qu'il s'agit d'un simple écart de synchronisation (0.3.6). Le Runtime doit exposer un mécanisme explicite de
resynchronisation, déclenché au minimum à chaque nouveau lancement de session.

### 7.15 Détection de panne — signal de niveau processus uniquement

Un mécanisme qui détecte automatiquement une panne de provider (authentification, quota) à partir de la sortie
d'un processus agent ne doit examiner que les canaux de niveau processus — stderr, code de sortie, erreurs d'outil
structurées — jamais stdout ou tout canal qui transporte le contenu généré par l'agent lui-même. Le raisonnement :
un agent peut légitimement écrire, produire ou discuter de texte qui ressemble à une erreur (« 429 », « rate
limit », « authentication_error ») sans que cela reflète un état réel du provider ; et parce que `ProviderProfile`
est un catalogue global (4.14), une fausse détection déclenche un verrouillage pour **tous** les agents du
provider concerné, pas seulement celui qui l'a émise (0.3.8).

---

## 8. Repository Engine

Le Repository Engine est **l'Engine de référence de Spline pour le travail impliquant du code** — le premier
Engine installable, fourni nativement, et l'exemple qui sert de modèle au contrat que tout autre Engine doit
respecter (chapitre 19.2). Il n'est pas le cœur du système : le cœur reste Workspace/Goal/Task/Run, agnostique du
domaine (chapitre 4). Les agents ne manipulent jamais directement Git ; ils demandent des opérations, le
Repository Engine les réalise.

### 8.1 Responsabilités

Repositories, branches, worktrees, commits, merges, conflits, validations, synchronisation.

### 8.2 Repository

Un Repository possède une origine, une branche principale, plusieurs worktrees, plusieurs branches, plusieurs
tâches.

### 8.3 Branches

```text
task/<task-id>
goal/<goal-id>
agent/<session-id>
```

Aucune tâche ne travaille directement sur `main`, `master`, `develop`.

### 8.4 Worktrees

```text
Repository → Worktree → Task → Run
```

Deux tâches ne partagent jamais le même Worktree.

### 8.5 Cycle

```text
Clone → Worktree → Checkout → Execute → Validate → Commit → Merge → Archive
```

### 8.6 Commits

Chaque commit produit par un agent contient Task ID, Goal ID, Run ID, Session ID, Provider, Timestamp.

### 8.7 Merge

Jamais réalisé par un agent. Conditions : validations réussies, politiques satisfaites, aucun conflit,
approbations obtenues.

### 8.8 Conflits

Types : fichier, dépendance, politique, merge, validation, architecture.

### 8.9 Résolution

```text
Automatic → Needs Review → Human Review
```

Un conflit non résolu bloque la tâche.

### 8.10 Validation Git

Avant chaque merge : Build, Tests, Lint, Security, Policy, Review. Tous doivent réussir.

### 8.11 Protection

Interdit : push direct sur main, suppression de branches protégées, modification des hooks, modification des
secrets, modification de l'historique.

### 8.12 Artefacts Git

Diff, logs, commits, rapports, résultats — deviennent des Artifacts versionnés.

### 8.13 Historique

RepositoryCreated, BranchCreated, WorktreeCreated, CommitCreated, MergeRequested, MergeCompleted, MergeRejected,
ConflictDetected, ConflictResolved.

---

## 9. Scheduling Engine

Le Scheduling Engine transforme un ensemble de Goals en exécutions ordonnées. Il ne réalise jamais le travail : il
décide où et quand.

### 9.1 Responsabilités

Allocation des tâches, ordonnancement, dépendances, priorités, retries, reprise après panne, équilibrage de
charge, utilisation optimale des Workers — y compris à travers plusieurs machines d'un même opérateur.

### 9.2 Objectifs

Temps total d'exécution, utilisation des Workers, coût, disponibilité, parallélisme, robustesse.

### 9.3-9.4 Entrées / Sorties

**Entrées** — Goals, Tasks, dépendances, Workers, capacités, Policies, contraintes.

**Sorties** — assignation, ordre d'exécution, réservation, file d'attente, estimation.

### 9.5 DAG

```text
Goal
 └── Task A
      ├── Task B ──┐
      └── Task C ──┴── Task D
```

Une tâche devient exécutable lorsque toutes ses dépendances sont satisfaites.

### 9.6 États

```text
WAITING → READY → SCHEDULED → ASSIGNED → RUNNING → VALIDATING → COMPLETED
```

États exceptionnels : BLOCKED, FAILED, RETRYING, CANCELLED, PAUSED, WAITING_APPROVAL.

### 9.7 Priorités

Critical, High, Normal, Low, Background.

### 9.8 Contraintes

OS, architecture CPU, GPU, provider, runtime, mémoire minimale, localisation, accès réseau, Engine ou Tool
spécifique installé sur le Worker.

### 9.9 Capacités

```text
Docker, Go, NodeJS, Rust, Python, GPU, Claude, Codex, Gemini
```

Une tâche ne peut être assignée qu'à un Worker compatible.

### 9.10 Affinité

Une tâche peut préférer un Worker, une Machine, un Provider, un Repository, sans que ce soit obligatoire.

### 9.11 Réservation

Avant l'exécution : le Worker, le Worktree (si applicable), les ressources, le Lease.

### 9.12 Retry

Chaque Retry crée un nouveau Run et une nouvelle Attempt. L'historique est conservé.

### 9.13 Timeout

Au dépassement : session arrêtée, Lease expire, tâche passe en échec ou retry.

### 9.14 Préemption

Une tâche critique peut interrompre une tâche moins prioritaire si le Lease est récupérable et la reprise
possible.

### 9.15 Scheduler Events

TaskScheduled, TaskAssigned, TaskQueued, TaskRetried, TaskCancelled, TaskPreempted, WorkerSelected,
WorkerRejected.

### 9.16 Double déclencheur : réactif et périodique

Le Scheduler ne doit jamais reposer uniquement sur un déclenchement réactif (« il y a du travail, donc on
réveille »). Un agent ou un Worker sans travail actionnable en attente doit malgré tout être revisité
périodiquement — pour signaler son inactivité, vérifier l'état du système, ou permettre à un rôle superviseur de
demander un prochain objectif. Sans ce second déclencheur, un système entièrement à jour finit par se taire pour
de bon, sans qu'aucun signal n'indique à personne qu'un nouveau travail est nécessaire (0.3.10).

```text
Reactive:  new actionable work → dispatch immediately
Periodic:  no actionable work AND checkpoint interval elapsed → dispatch a check-in anyway
```

L'intervalle périodique (« checkpoint ») est délibérément plus long que la latence de dispatch réactif — il n'y a
rien d'urgent à traiter, seulement une présence à confirmer.

---

## 10. Collaboration Protocol

Spline définit un protocole obligatoire. Tous les agents suivent exactement le même cycle. Aucun provider n'est
autorisé à définir son propre protocole.

### 10.1 Objectifs

Cohérence, reproductibilité, audit, coordination, reprise.

### 10.2 Cycle général

```text
Synchronize → Read → Plan → Acquire → Execute → Validate → Publish → Release → Await
```

### 10.3 Synchronize

Workspace, Task, Goal, Locks, Policies, Repository (si applicable), Events.

### 10.4 Read

Artefacts, Décisions, Blockers, Notifications.

### 10.5 Plan

Objectif, ressources, risques, sorties attendues. Le plan devient un Artifact.

### 10.6 Acquire

Locks, Lease, Worktree (si applicable). Sans autorisation : aucune action.

### 10.7 Execute

Exécute, produit, modifie, compile, teste — toujours via le Runtime.

### 10.8 Publish

Progression, résultats, blocages, nouveaux artefacts. Aucune longue exécution silencieuse.

### 10.9 Validate

L'agent demande Validation. Il ne décide jamais lui-même que son travail est terminé.

### 10.10 Release

Locks, Lease, Worktree temporaire, Processus temporaires.

### 10.11 Await

Une nouvelle tâche, une validation, une annulation.

### 10.12 Communications

Toujours des événements structurés, jamais du texte libre :

```json
{ "type": "...", "actor": "...", "task": "...", "goal": "...", "action": "...", "timestamp": "...", "payload": {} }
```

### 10.13 Intentions

IntentStartTask, IntentModifyRepository, IntentMergeBranch, IntentRestartProcess, IntentDeleteArtifact,
IntentInvokeTool.

### 10.14 Résultats

TaskProgress, TaskCompleted, TaskFailed, ArtifactCreated, ValidationRequested, BlockerDetected.

### 10.15 Blocages

Une cause, un auteur, une gravité, une solution proposée.

### 10.16 Violations

Modifier sans Lock, ignorer les Policies, agir sans Synchronize, conserver un Lease expiré, ne publier aucun
résultat — le Runtime peut interrompre cette session.

### 10.17 Garanties

Aucune tâche sans propriétaire, aucun travail sans isolation adéquate, aucune action sans audit, aucune
modification sans validation, aucun provider privilégié, aucune communication non structurée, aucun Engine ou Tool
privilégié par rapport à un autre.

### 10.18 Ce que l'étude d'OpenClaw apporte à ce protocole

OpenClaw est le point de comparaison assumé du projet (0.1). Son modèle d'agents a été étudié pour
éprouver celui-ci. Quatre mécanismes qu'il possède et que Spline n'a pas, et deux manques qu'il documente
lui-même et que Spline couvre déjà.

**a) Deux verbes distincts, pas un seul.** ~~Manque réel~~ — **livré** (module `conversation`). OpenClaw
sépare `sessions_spawn` (déléguer un travail : il s'exécute dans une session isolée et **annonce son
résultat en retour**) de `sessions_send` (parler à un agent et attendre sa réponse). Spline ne possédait
que l'assignation d'une Task, qui n'est ni l'un ni l'autre : personne n'attendait rien en retour, et rien
ne reliait le résultat au demandeur.

Un **fil** porte désormais les deux : ouvert avec un `taskId`, il délègue et attend ; ouvert sans, il
parle. Un écouteur répond au fil de lui-même quand la tâche se règle — succès, échec **ou** annulation,
parce qu'un échec est une réponse et que c'est celle dont un demandeur a le plus besoin. Sans cet
écouteur, le demandeur devrait scruter, ce qui est exactement le goulot d'étranglement dont leur propre
issue se plaint.

**b) Une borne sur les échanges.** ~~Aucune borne~~ — **livré**. Cinq tours au plus, comme chez eux, et
un jeton de terminaison explicite (leur `REPLY_SKIP`). Trois points appris en l'écrivant :

- **Demander EST un tour.** Le compter à part ferait qu'un budget de 1 signifie « tu demandes, il
  répond » — ce qui fait deux.
- **La borne s'applique sur la tentative qui déborderait**, pas la suivante : finir un tour trop tard
  voudrait dire que le budget était déjà dépassé au moment où on s'en aperçoit.
- **Terminer et être tronqué doivent rester distinguables** (`CLOSED` vs `EXHAUSTED`), sinon personne ne
  sait laquelle des deux a eu lieu.

`ReactionDepth` (kernel §5.2) ne pouvait pas couvrir ce cas et ne le pourra jamais : il borne une cascade
**technique**, et ici chaque tour est un appel séparé, avec sa propre pile.

**c) La communication est fermée par défaut.** `tools.agentToAgent.enabled` est faux par défaut, et
chaque agent autorisé doit figurer dans une liste `allow`. L'isolement est la valeur par défaut, se
parler est un choix.

**Ne pas copier ce défaut-là est délibéré**, et la raison tient en une phrase : chez eux l'unité
d'isolement est l'**agent**, ici c'est le **workspace** — l'appartenance *est* l'autorisation (§4.2).
Copier leur liste `allow` importerait une frontière que ce système trace ailleurs.

Ce que cette section demandait vraiment — « le point d'accroche doit exister avant, sinon la politique
n'aura rien à décider » — **existe désormais** : un fil nomme ses **deux** côtés, et y parler sans en
être est refusé quelle que soit l'appartenance au workspace. Ouvrir un fil est un acte identifiable,
donc un endroit où une règle du Policy Engine (§12) peut vivre le jour où il y en aura une.

Aucun port permissif n'est posé d'avance. Un branchement qui répond toujours « oui » a déjà été retiré
une fois de ce code : il ne prouve rien et se lit comme une garantie.

**d) Une résolution déterministe et ordonnée, jamais un score.** Le routage d'OpenClaw suit une
précédence écrite (pair exact → pair parent → joker → guilde+rôles → guilde → équipe → compte → canal →
agent par défaut), les égalités étant tranchées par l'ordre du fichier. Quand le Scheduling Engine (§9)
choisira à qui confier un travail, ce sera la forme à retenir : une table de précédence lisible et
rejouable, pas une heuristique pondérée dont personne ne peut prédire la sortie.

**Ce que Spline a déjà et qu'OpenClaw cherche encore.** L'issue publique #12401 réclame chez eux un vrai
protocole inter-agents et énumère leurs contournements actuels : tout passer par la session principale
(goulot d'étranglement), écrire dans un fichier `.jsonl` partagé (courses critiques, scrutation), et un
`sessions_send` qui exige de connaître l'étiquette de session, sans publication/abonnement ni découverte.
Restent chez eux non résolus : persistance des messages, isolation par locataire, limitation de débit,
file de rebut.

Spline répond déjà à trois de ces quatre points, et c'est la confirmation que le socle est le bon :
persistance et ordre total des faits (§14, Event), état de lecture individuel par destinataire (§4.19,
Notification), isolation par workspace absolue (§4.2). La limitation de débit est **livrée** depuis
(§18.11) ; la file de rebut reste ouverte.

**Une leçon d'architecture, enfin, qui n'est pas un manque mais un pari opposé.** OpenClaw garde un
noyau d'exécution minimal (quatre outils) et laisse les agents s'étendre en écrivant du code ; Spline
parie sur un registre d'Engines et de Tools publiables (§19). Les deux se défendent, mais la leçon à
retenir est celle de la surface : **garder le noyau d'outils petit**, l'extension venant du registre et
non d'un noyau qui grossit.

---

## 11. Validation Engine

Le Validation Engine détermine objectivement si une tâche, un Goal ou une modification peut être considéré comme
terminé. Les agents ne déclarent jamais eux-mêmes une réussite. Ils soumettent des résultats.

### 11.1 Principes

Reproductible, observable, historisée, indépendante du provider, configurable.

### 11.2 Types de validation

Liste ouverte : de nouveaux types peuvent être publiés via l'Extension Registry (chapitre 19) pour des domaines
au-delà du logiciel.

- **Technique** — compilation, exécution, lint, formatage, dépendances, sécurité.
- **Fonctionnelle** — critères d'acceptation, comportement attendu, exigences métier.
- **Humaine** — une approbation, potentiellement obligatoire.
- **Automatique** — réalisée par le système (CI, tests, scanners, politiques).
- **Agentique** — réalisée par un autre agent spécialisé (Review, Security, Performance, Architecture,
  Documentation).

### 11.3 Pipeline

```text
Request → Prepare → Execute → Collect → Evaluate → Publish → Complete
```

### 11.4-11.6 Requête, résultat, statuts

**Request** — ressource, type, politiques, artefacts, auteur, contexte.

**Result** — statut, durée, rapport, métriques, erreurs, recommandations.

**Statuts** — Pending, Running, Succeeded, Failed, Cancelled, Skipped.

### 11.7 Conditions de réussite

Toutes les validations obligatoires réussissent, aucune politique n'est violée, toutes les approbations existent,
tous les blocages sont levés.

### 11.8 Revalidation

Toute modification importante (nouveau commit, changement de politique, changement de dépendance) invalide
automatiquement les validations précédentes.

### 11.9 Validation Graph

```text
Build → Unit Tests → Integration Tests → Security → Architecture Review → Human Approval
```

### 11.10 Rapports

Build Report, Coverage Report, Security Report, Performance Report, Review Report — chacun un Artifact.

---

## 12. Policy Engine

Le Policy Engine définit les règles du Workspace. Les politiques sont déclaratives. Les agents ne peuvent pas les
contourner.

### 12.1 Objectifs

Autorisations, interdictions, limites, obligations.

### 12.2 Hiérarchie

```text
Organization → Workspace → [Repository, si la Task en utilise un] → Goal → Task
```

Le Repository est une étape **conditionnelle**. Quand une Task n'a pas de `repository_id`, l'héritage saute
directement de Workspace à Goal — ce n'est jamais un état d'erreur, c'est le cas normal pour tout travail hors du
domaine logiciel. Une politique plus spécifique surcharge une politique plus générale.

### 12.3 Types

**Security** — accès réseau, accès internet, secrets, fichiers protégés.

**Runtime** — timeout, mémoire maximale, CPU, GPU.

**Git** — branches protégées, merge obligatoire, review obligatoire, signature des commits (ne s'appliquent qu'aux
Workspaces utilisant le Repository Engine).

**Validation** — build obligatoire, couverture minimale, sécurité obligatoire.

**Cost** — coût maximal, nombre maximal de tokens, nombre maximal d'appels.

**Extension** — quelles Extensions un Workspace a le droit d'installer, signature obligatoire ou non, source de
confiance.

### 12.4-12.5 Évaluation et violations

```text
Action → Policy Engine → Allowed ? → Yes → Execution
```

Sinon `Denied`. Toute violation génère un Event, une entrée Audit, une Notification, et peut suspendre une
Session.

---

## 13. Lock Manager

Le Lock Manager protège les ressources critiques. Les Locks sont distribués et possèdent toujours une durée de
vie.

### 13.1 Ressources

Fichier, dossier, branche, Worktree, Process, Port, Environment, Secret, Repository.

### 13.2 Cycle

```text
Acquire → Granted → Renew → Release
```

ou `Acquire → Rejected`.

### 13.3 Lease

Chaque Lock est associé à un Lease. Sans Lease valide, le Lock est automatiquement supprimé.

### 13.4 Conflits

Deux demandes concurrentes produisent `Granted`, `Waiting`, ou `Rejected`, selon la politique.

### 13.5 Expiration

Automatique. Jamais permanente.

### 13.6 Recovery

Après un crash : détecte les Leases expirés, supprime les Locks, notifie le Scheduler.

### 13.7 Réacquisition vs conflit — deux chemins, deux tests

Ré-acquérir un lock qu'on détient déjà (même acteur, même lease) est **idempotent** : succès immédiat, aucun
nouvel état créé. Acquérir un lock détenu par un **acteur différent** est un **conflit réel** : `Waiting` ou
`Rejected` selon la politique. Ce sont deux chemins de code distincts. Un test qui vérifie le comportement de
conflit en utilisant le même acteur des deux côtés du scénario ne teste en réalité que la réacquisition idempotente
— ce précédent est arrivé et a laissé le vrai scénario de conflit non couvert (0.3.5). Toute suite de tests pour
`ResourceLock` doit exercer les deux chemins séparément, avec deux acteurs distincts pour le second.

---

## 14. Event Bus

Le Event Bus constitue le système nerveux de Spline. Tous les composants communiquent uniquement au travers
d'événements.

### 14.1 Caractéristiques

Persistants, ordonnés, versionnés, rejouables, immuables.

### 14.2 Catégories

Workspace, Goal, Task, Worker, Session, Validation, Repository, Artifact, Notification, Audit, Policy, Lock,
Extension.

### 14.3 Publication

Chaque événement est publié une seule fois. Les consommateurs décident ensuite de leur traitement.

### 14.4 Réception individuelle

Un Event lui-même ne porte pas d'état de lecture. Quand un type d'événement nécessite un accusé de réception par
agent, un `EventReceipt` séparé (4.21) le porte — jamais un attribut ajouté à l'Event.

### 14.5 Replay

Reprise après panne, debugging, reconstruction, audit.

### 14.6 Garanties

Ordre, persistance, livraison, traçabilité.

---

## 15. Artifact System

Les Artifacts représentent tous les objets produits par Spline. Ils constituent la mémoire durable du projet.

### 15.1 Types

Documents, Logs, Diffs, Commits, Captions, Reports, Screenshots, Specifications, Benchmarks, Plans, Metrics,
Models, Bundles.

### 15.2 Versionnement

Chaque modification produit une nouvelle version. Les anciennes versions restent consultables.

### 15.3 Relations

Workspace, Repository, Goal, Task, Run, Validation, Event, Decision.

### 15.4 Stockage

Métadonnées et Contenu séparés. Contenu : local, Object Storage, Git, base documentaire.

### 15.5 Cycle de vie

```text
Created → Versioned → Linked → Archived → Deleted
```

La suppression peut être interdite par les politiques.

### 15.6 Recherche

Par type, auteur, Goal, Task, Repository, date, tags, contenu.

### 15.7 Immutabilité

Audit, Validation Report, Signed Report, Release Bundle.

---

## 16. Memory System

Le Memory System fournit aux agents un accès cohérent à la connaissance du projet. Aucune mémoire ne constitue la
source de vérité — celle-ci reste le Domain Model.

### 16.1 Principes

Persistante, versionnée, contextualisée, observable, requêtable, indépendante des providers.

### 16.2 Hiérarchie

```text
Organization Memory → Workspace Memory → Repository Memory → Goal Memory → Task Memory → Run Memory → Session Memory
```

### 16.3-16.8 Niveaux

**Workspace** — architecture, conventions, documentation, décisions, politiques, historique.

**Repository** — structure, modules, conventions Git, historique architectural, ADR, dépendances (présent
uniquement si le Repository Engine est utilisé).

**Goal** — objectifs, contraintes, décisions, avancement.

**Task** — ressources utiles, fichiers concernés, dépendances, blocages, résultats précédents.

**Run** — événements, logs, artefacts, validations, erreurs.

**Session** — temporaire, disparaît en fin de session, ne contient jamais d'information critique.

### 16.9 Indexation

Type, date, auteur, Goal, Task, Repository, tags.

### 16.10 Reconstruction

À partir des Artifacts, des Events, des Decisions, des Repositories.

---

## 17. Observability

Spline est conçu pour être entièrement observable, y compris les Engines et Tools tiers.

### 17.1 Objectifs

Supervision, audit, debugging, optimisation, reprise.

### 17.2-17.5 Logs, Metrics, Traces, Dashboards

**Logs** — système, métier, runtime, provider, extension.

**Metrics** — CPU, mémoire, durée, coût, nombre de tâches, validations, retries, erreurs.

**Traces**

```text
Goal → Task → Run → Session → Provider → Validation
```

**Dashboards** — Workspaces, Workers, Providers, Goals, Tasks, Runtime, Validation, Git, Extensions installées.

### 17.6 Health

Healthy, Warning, Degraded, Unhealthy.

### 17.7 Seuils de staleness

Chaque type de ressource surveillée (Machine, Session, RuntimeCommand) définit un TTL explicite au-delà duquel
elle est considérée « stale » — calculé à la lecture depuis le dernier heartbeat, pas via un balayage périodique
séparé qui pourrait lui-même retarder. Ces seuils sont des paramètres du système, documentés et ajustables, jamais
des constantes implicites dispersées dans le code.

### 17.8 Rollup avec détail nominatif, jamais seulement un compte

Un état dégradé doit toujours être rapporté avec la liste concrète des ressources concernées (identifiant, type,
depuis quand), pas uniquement leur nombre. « 21 commandes runtime bloquées » sans savoir lesquelles est une alerte
qu'un opérateur ne peut pas agir dessus — ce point a été observé directement en exploitation (0.3.3). Le rollup de
santé runtime (Runtime Health, 5.18) expose donc systématiquement : le compte agrégé pour la vue d'ensemble, et le
détail nominatif pour l'investigation, jamais l'un sans l'autre.

### 17.9 Alertes

Worker Offline, Lease Expired, Validation Failed, Policy Violation, Repository Conflict, Provider Unavailable,
Runtime Crash, Extension Incompatible.

---

## 18. Security

La sécurité est appliquée à tous les niveaux, y compris aux Engines et Tools communautaires.

### 18.1 Principes

Least Privilege, Zero Trust, Defense in Depth, Audit First, Isolation.

### 18.2-18.3 Authentification et autorisation

Acteurs : Humans, Agents, Workers, Services — chacun avec une identité. Toutes les opérations passent par RBAC,
évalué avant toute action.

### 18.4 Secrets

Jamais transmis directement aux agents, ni aux Extensions. Le Runtime fournit uniquement les secrets nécessaires à
la tâche, filtrés par ce que l'Extension a explicitement déclaré requérir.

### 18.5-18.6 Isolation et Sandbox

Isolation entre Workspaces, Repositories, Worktrees, Sessions, Providers, Extensions. Sessions exécutées dans
Docker, VM, Sandbox Provider, ou process isolé.

**Deux couches, et la distinction entre elles doit rester écrite.** Un processus ne peut pas se confiner
lui-même : tout ce qu'un Worker applique sans le noyau relève de la **discipline**, jamais de la frontière. Sans
cette phrase, la première liste ci-dessous se lirait comme un bac à sable qu'elle n'est pas.

**Couche 1 — la discipline.** Ce qu'un Worker applique lui-même, et qui est vérifiable par test :

| Contrôle | Ce qu'il ferme |
| --- | --- |
| Jamais de shell, arguments en liste | L'injection par le texte qu'un agent a écrit |
| Commande = un **nom**, ni ligne ni chemin | `sh -c …` et `/tmp/evil/git` qui finit par un nom autorisé |
| **Liste blanche fermée par défaut** — vide n'exécute rien | Qu'un opérateur qui ne configure rien exécute tout |
| Environnement construit à partir de rien | La fuite des secrets de la machine et des autres workspaces (§6.10) |
| Variables de chargement de code **refusées** (`LD_PRELOAD`, `NODE_OPTIONS`, `BASH_ENV`, `GIT_SSH_COMMAND`…) | Le contournement de la liste blanche sans shell : le programme autorisé s'exécute, mais charge le code de l'attaquant |
| `PATH` appartient à la machine, jamais à la tâche | Que le nom autorisé résolve vers un autre programme |
| Répertoire jugé sur le **chemin réel** (`realpath`), pas écrit | Le lien symbolique qui sort du workspace en restant syntaxiquement dedans |
| Délai d'exécution, tuant le **groupe** de processus | La tâche qui ne sort jamais, et l'enfant qui survit à sa propre tâche |
| Plafond de sortie, lecture arrêtée à la limite | L'épuisement mémoire sans charge utile |
| Refus de démarrer en **root** | Que tout ce qui précède soit décoratif |
| Fichier de jeton refusé s'il est lisible au-delà de son propriétaire | Le vol de credential par un autre compte de la machine |

**Couche 2 — la frontière.** Ce qu'un Worker ne peut pas appliquer lui-même, et que **le noyau applique** : le
backend d'exécution conteneurisé, qui est **le défaut**.

| Ce que le noyau tient | Comment |
| --- | --- |
| **La course TOCTOU** | L'espace de noms de montage. Un lien symbolique dans le workspace résout désormais *dans le conteneur* : son `/etc` est celui de l'image, et le système de fichiers de l'hôte n'est pas atteignable. Gagner la course ne rapporte plus rien, parce qu'il n'y a plus rien dehors à atteindre. |
| **Le réseau** | `--network none` |
| **Le reste du disque** | Un seul montage, racine en lecture seule, tmpfs `noexec` pour `/tmp` |
| **Les ressources** | `--memory`, `--memory-swap` (épinglé à la mémoire, sinon la tâche déborde simplement en swap), `--cpus`, `--pids-limit` |
| **Le privilège à l'intérieur** | `--cap-drop ALL`, `--security-opt no-new-privileges`, `--user` non-root, `--rm` |

Les deux couches s'appliquent **dans cet ordre et toujours les deux** : la liste blanche et les règles
d'environnement passent avant la frontière. Un conteneur est une frontière, pas une raison d'arrêter de vérifier
ce qu'on y met (§18.1, défense en profondeur).

Les secrets sont transmis **par nom**, jamais par valeur : une valeur en argv est une valeur dans `ps`, lisible
par tout compte de la machine (§18.4).

**Ce qui reste vrai malgré tout**, et doit rester écrit :

- **Le mode `host` ne donne rien de tout cela.** Il existe pour une machine sans runtime de conteneurs — elle peut
  encore s'enregistrer et rapporter — et c'est un choix explicite, journalisé bruyamment à chaque démarrage. Une
  configuration incomplète (image absente) **refuse** plutôt que de retomber sur l'hôte : retomber transformerait
  un réglage oublié en frontière silencieusement supprimée.
- **L'image est de confiance.** Rien ne vérifie ce qu'elle contient ; une image empoisonnée est une tâche
  empoisonnée. C'est le point d'accroche de la chaîne d'approvisionnement (§19.3).
- **Le runtime de conteneurs est de confiance.** Un démon `docker` joignable par cet utilisateur équivaut à root
  sur l'hôte ; Podman sans privilèges est l'assise plus solide, et le code l'accepte déjà.
- **La liste de refus de variables énumère toujours le connu.** Elle est désormais redondante avec la frontière
  plutôt que porteuse — c'est sa bonne place — mais elle reste une liste.

### 18.12 L'injection indirecte est une élévation de privilège, pas une erreur de modèle

Un agent lit du contenu qu'il n'a pas écrit — un README, une page, un ticket, la sortie d'un autre agent — et ne
peut pas distinguer « instruction de mon opérateur » de « instruction cachée dans ce que j'ai lu ». Toute route
qu'un agent peut appeler est donc une route qu'un attaquant peut appeler à travers lui, sans jamais authentifier
quoi que ce soit.

La conséquence est une règle d'attribution de permissions, pas un problème de filtrage :

> **Aucun rôle d'agent ne détient une permission qui aboutit à l'exécution sur une machine.** Enfiler un ordre
> pour un Worker est un acte humain (`manage_machines`). Quand le Task Engine devra le faire pour le compte d'un
> agent, il le fera **en tant que hub**, depuis une décision qu'il a prise — jamais en ouvrant la route aux agents.

Rencontré concrètement : `POST /workspaces/:id/runtime/commands` exigeait `execute_tasks`, que détient un
`AGENT_CONTRIBUTOR`. La chaîne complète était donc : fichier empoisonné → agent → ordre enfilé → exécution sur la
machine de l'opérateur.

Corollaire de la même famille : un agent ne rapporte jamais un fait qui déclenche une décision globale. §7.15 le
tient déjà — l'indisponibilité d'un provider se lit dans la sortie d'un **processus**, jamais dans ce qu'un agent
affirme.

### 18.7 Audit

Merge, Delete, Policy Update, Permission Change, Secret Access, Extension Install, Extension Publish.

### 18.8 Exception de bootstrap RBAC

Un contrôle RBAC générique qui vérifie « cette ressource appartient-elle au Workspace de l'appelant » échoue par
construction sur l'action qui établit précisément ce rattachement — lier une machine à un workspace, inviter le
premier membre, enregistrer un premier credential. Ces actions ont besoin d'une exception de bootstrap **explicite
et étroitement scopée** (une liste nommée d'opérations, jamais une désactivation générale du contrôle), documentée
au même endroit que la vérification qu'elle contourne. Ce point a été rencontré concrètement sur le rattachement
de machine (0.3.2) et se généralise à toute action de première liaison.

### 18.9 Fraîcheur des identifiants isolés

Toute copie de secret produite pour l'isolation (sandbox, machine locale) doit être resynchronisée quand sa
source change, jamais figée à sa création. Détail et justification en 7.14.

### 18.10 Un identifiant dans un chemin n'est pas une preuve d'identité

Une ressource qui a un propriétaire porte ce propriétaire **en base** et le vérifie à **chaque** acte, même quand
la route « appartient » manifestement à cette ressource. L'identifiant présent dans le chemin est une donnée
fournie par l'appelant, jamais une preuve.

Rencontré concrètement sur les routes de machine : `POST /runtime/workers/:workerId/commands/claim` n'était gardée
que par « être authentifié », si bien que n'importe quel acteur du système pouvait réclamer les ordres adressés à
la machine d'un autre — en lire les charges utiles, et les rendre inaccessibles à leur destinataire, déjà
`CLAIMED`. Même trou à l'enregistrement, qui fait un upsert par nom d'hôte. `WorkerNode` porte donc `registeredBy`,
vérifié avant tout battement, réclamation, rapport ou ré-enregistrement. Le refus est un **403 et non un 404** : la
ressource existe, et répondre « introuvable » enverrait un opérateur déboguer une machine qui va bien (§20.6).

### 18.10bis Le jeton de tâche — l'identité d'un agent qui rappelle

Un agent qui exécute une tâche doit rappeler le hub : c'est le cycle §10 (Synchronize, Publish, Validate). La
question « avec quelle identité ? » n'a que deux mauvaises réponses et une bonne.

- **Le credential de la machine** : chaque entrée du journal dirait que la machine a fait ce que l'agent a fait.
  C'est exactement l'usurpation que §18.10 interdit.
- **Un credential d'agent longue durée** : une tâche empoisonnée disposerait de toute l'autorité de l'agent, pour
  toujours.
- **Un jeton de tâche** : l'identité de l'agent, ce workspace, cette tâche, ces portées, cette heure.

**Frappé au retrait, jamais au dispatch.** Comme les secrets : un jeton créé au moment d'une décision vivrait
jusqu'à une exécution qui peut être bien plus tardive.

**La portée effective est une intersection** — demandé ∩ détenu par le rôle — et jamais un sur-ensemble. La règle
n'est pas théorique : OpenClaw a livré une rotation de jeton sans elle (CVE-2026-32922, CVSS 9.9), et un appelant
détenant une portée d'appairage pouvait frapper une portée d'administration. Le contrôle coûte deux lignes et vit
là où toute requête passe.

**Ce qu'un jeton de tâche ne peut pas être** : sans portée (un credential qui ne permet rien donne des refus sans
explication à son porteur), sans expiration, ou valable dans un autre workspace.

### 18.11 Le durcissement HTTP appartient à une fonction testable, pas au bootstrap

CORS, en-têtes de sécurité, limite de débit et plafond de taille de corps sont des contrôles de sécurité comme les
autres : ils doivent être **prouvés par un test**. Écrits directement dans le point d'entrée du serveur, ils ne le
peuvent pas — un test d'intégration construit l'application depuis le graphe de modules et n'exécute jamais ce
point d'entrée. Ils vivent donc dans une fonction appelée par les deux.

Valeurs de référence : origines navigateur en liste blanche (aucune par défaut) ; plafond de corps explicite, parce
qu'un `payload` de politique ou de commande accepte du JSON arbitraire par conception ; limite de débit globale
généreuse, et limite stricte sur les routes qui devinent un secret (`/auth/login`, `/auth/register`), puisque le
hachage rend chaque tentative bon marché pour l'attaquant et coûteuse pour le serveur. Une clé de signature est
refusée au démarrage en dessous de 32 caractères. Un Worker refuse de démarrer si son hub est joignable en `http`
ailleurs qu'en loopback : son jeton porteur voyagerait en clair.

---

## 19. Extensibility & Community

Spline est un projet open source. Le noyau reste volontairement minimal et agnostique du domaine de travail
(chapitre 1.3, chapitre 4) ; tout ce qui étend ses capacités — un nouveau domaine de travail, un nouvel outil, un
nouveau type de validation, un nouveau modèle de politique — est une **Extension** installable, publiée par
n'importe qui, y compris la communauté.

### 19.1 Principe

Le noyau ne doit jamais avoir besoin d'être modifié pour qu'un nouveau domaine de travail devienne possible. Le
Repository Engine (chapitre 8) en est la preuve : il aurait pu être écrit par un tiers en suivant le même contrat
que celui décrit ici, sans aucun accès privilégié au noyau.

### 19.2 Engine

Un Engine est un adaptateur de domaine de travail, fournissant au Task Engine, au Scheduler et au Validation
Engine ce dont ils ont besoin pour traiter uniformément n'importe quel domaine.

**Contrat qu'un Engine doit respecter** — déclarer les types d'Artifact qu'il produit, les types de Validation
qu'il sait exécuter, les Tools dont il dépend, fournir un mécanisme de préparation d'environnement (l'équivalent
du Worktree pour Git), et des critères de complétion vérifiables, jamais une simple déclaration de l'agent.

**Champs** — id, name, publisher, version, capabilities, required_tools, provided_validation_types,
provided_artifact_types, status.

**Statuts** — draft, published, deprecated.

### 19.3 Tool

Un Tool est une capacité que le Runtime expose à un agent (7.7). Spline adopte **MCP** (Model Context Protocol)
comme protocole d'intégration des Tools plutôt que d'inventer un format propriétaire : un serveur MCP publié par
quiconque devient un Tool utilisable par tout agent, sur tout Workspace qui l'installe.

### 19.4 Extension Registry

**Champs** — id, kind (`engine` | `tool` | `validation_type` | `policy_template`), name, publisher, version,
source_url, signature, install_count, status.

Une Extension publiée est visible par tous ; elle n'est **active** sur un Workspace donné qu'après installation
explicite.

### 19.5 Installation

```text
Discover → Review → Acquire → Install → Active → Revoke
```

Aucune Extension n'est active par défaut au-delà des Engines de référence fournis nativement.

### 19.6 Contribution

```text
Submit → Automated Compatibility Check → Human Review → Publish
```

Une première publication passe toujours par une revue humaine, jamais une automatisation seule.

### 19.7 Confiance & Sécurité

Une Extension communautaire s'exécute sous exactement les mêmes contraintes qu'un composant de référence : même
Sandbox, mêmes Policies, mêmes secrets filtrés par déclaration explicite, même audit. Aucune Extension ne reçoit de
privilège que les autres n'ont pas.

### 19.8 Versioning & Compatibilité

Chaque Extension déclare la plage de versions du noyau avec laquelle elle est compatible. Le Control Plane refuse
d'installer ou d'exécuter une Extension incompatible plutôt que de dégrader silencieusement son comportement.

---

## 20. API

Toutes les fonctionnalités de Spline sont accessibles par API.

### 20.1 Principes

REST, Streaming, WebSocket, Event Driven.

### 20.2 Ressources

```text
/organizations   /workspaces     /repositories   /goals
/tasks           /runs           /attempts       /workers
/sessions        /locks          /events         /artifacts
/notifications   /policies       /validations    /audit
/extensions      /engines        /tools          /providers
```

### 20.3 Opérations

Create, Read, Update, Delete — lorsque cela est autorisé.

### 20.4 Notifications — contrat de requête

Une route dédiée retourne, pour un destinataire donné, tout ce qui est non lu **dans un Workspace précis** —
`workspace_id` est obligatoire, comme pour toute autre requête du système (ex.
`GET /workspaces/:workspaceId/notifications/unread?recipientType=...&recipientId=...`). L'isolation par Workspace
(4.2) ne souffre aucune exception, pas même pour cette requête. C'est le fan-out par destinataire réel — pas
l'agrégation cross-workspace — qui est l'exigence non négociable ici : envoyé à plusieurs agents, un agent le lit,
la requête « non-lu » ne le retourne plus pour lui mais encore pour les autres, à l'intérieur du même workspace.
Testé automatiquement (26).

### 20.5 Streaming

Task Updated, Worker Offline, Validation Completed, Lease Expired, Extension Installed.

### 20.6 Contraintes visibles avant l'échec

Quand le backend interdit une action de façon permanente pour un rôle ou un état donné (ex. seules les sessions
manager sont reprenables par un humain), cette contrainte doit être exposée dans la représentation de la ressource
elle-même (ex. un indicateur `resumable: boolean` avec sa raison), pour que le client puisse la refléter avant
tentative — pas seulement en réponse d'erreur après coup. Une contrainte invisible se lit comme un bug, même quand
elle est un comportement voulu (0.3.12).

---

## 21. Runtime Protocol

Le Runtime Protocol définit la communication entre le Control Plane et les Workers.

### 21.1 Cycle

```text
Register → Authenticate → Synchronize → Heartbeat → Receive Task → Execute → Publish → Complete
```

### 21.2 Heartbeat

État, charge, sessions, leases, runtime version — à intervalle régulier, distinct du double déclencheur du
Scheduler (9.16) qui, lui, décide quand réveiller un agent inactif plutôt que de mesurer la santé du Worker.

### 21.3 Synchronisation

Policies, Workspace, Tasks, Locks, Repositories (si applicable), Extensions installées.

### 21.4 Déconnexion

Tentative de reconnexion ; au-delà du délai, les Leases expirent.

---

## 22. State Machines

Toutes les entités critiques possèdent une machine à états.

### 22.1-22.5 Machines

**Task** — `Planned → Ready → Assigned → Running → Validating → Completed`, exceptions `Blocked`/`Failed`/`Cancelled`.

**Worker** — `Offline → Registering → Ready → Running → Draining → Offline`.

**Session** — `Created → Ready → Executing → Waiting → Completed`.

**Validation** — `Pending → Running → Succeeded` ou `Pending → Running → Failed`.

**Repository** — `Created → Ready → Working → Validating → Merged → Archived`.

**Extension** — `Draft → Submitted → Reviewed → Published → Deprecated`.

### 22.6 Transitions idempotentes — règle transversale

**Toute machine à états du système applique la même règle : tenter une transition qui laisserait l'entité dans son
état déjà courant est un no-op réussi ; tenter une transition invalide depuis un état terminal retourne un
résultat typé explicite (ex. `AlreadyInTargetStateError`, `InvalidTerminalTransitionError`) ; ni l'un ni l'autre ne
lève jamais d'exception non gérée jusqu'à l'appelant.** Un appel « arrêter » sur une session déjà arrêtée, ou
« annuler » sur une tâche déjà terminée, doit répondre proprement — ce point a été manqué une fois en
implémentation (arrêt d'une session déjà dans un état terminal faisant planter l'appelant) avant d'être formalisé
ici (0.3.4). Cette règle s'applique à Task, Session, Lock, Validation, Extension, et toute future machine à états
ajoutée au système.

---

## 23. Failure Recovery

Spline est conçu pour survivre aux pannes.

### 23.1 Pannes

Crash Worker, crash Runtime, perte réseau, redémarrage, indisponibilité Provider, Extension défaillante (isolée,
ne doit jamais faire tomber le noyau).

### 23.2 Reprise

Le Scheduler détecte les Leases expirés. Les tâches sont réassignées — au même provider si une Attempt est
reprise (4.8). Les artefacts restent disponibles.

### 23.3 Checkpoints

Les longues exécutions produisent des Checkpoints, permettant une reprise.

### 23.4 Retry

Contrôlés, historisés, créent toujours une nouvelle Attempt.

---

## 24. Deployment

Spline peut être déployé : Local, Docker, Kubernetes, On Premise, Cloud.

### 24.1 Composants

Control Plane, API, Database, Redis, Workers, Runtime, Storage.

### 24.2 Scalabilité

Le Control Plane est horizontalement scalable. Les Workers peuvent être ajoutés dynamiquement — y compris
plusieurs machines personnelles d'un même opérateur, sans distinction architecturale avec un parc plus large.

### 24.3 Haute disponibilité

Les services critiques peuvent être répliqués. La perte d'un Worker ne provoque pas la perte des tâches.

---

## 25. Future Extensions

Au-delà du mécanisme d'extension déjà couvert en V1 (chapitre 19) :

- Multi Organization
- Federated Clusters
- Cloud Workers
- GPU Scheduling
- Vitrine Marketplace (découverte, notation, paiement — au-dessus du registre technique déjà en V1)
- Autonomous Organizations
- Multi Repository DAG
- Multi Cluster Scheduling
- Cost Optimizer
- Learning Engine

---

## 26. Success Criteria

Spline est considéré conforme lorsque :

- plusieurs providers collaborent sans modification de l'architecture
- plusieurs Workers, y compris sur plusieurs machines d'un même opérateur, exécutent des tâches simultanément
- les tâches survivent aux pannes
- Git reste cohérent pour les Workspaces qui l'utilisent
- les validations sont systématiques
- les politiques sont appliquées
- toutes les actions sont auditables
- les artefacts sont versionnés
- les événements sont persistés
- le système peut être reconstruit à partir de son état métier
- aucun provider n'est privilégié ; aucun Engine ou Tool, natif ou communautaire, n'est privilégié
- le Control Plane reste l'unique source de vérité
- chaque composant est observable, chaque décision est traçable, chaque exécution est reproductible
- un contributeur externe peut publier un Engine ou un Tool sans modifier le noyau
- une Task, un Goal ou un Workspace fonctionnent pleinement sans qu'aucun Repository n'existe — le logiciel reste
  un cas d'usage, jamais une condition
- **deux acteurs ne peuvent jamais commencer la même tâche faute d'assignation explicite** — testé, pas seulement
  documenté (4.6)
- **un message ou une notification broadcast a un état de lecture individuel et fiable par destinataire, testé
  automatiquement** : envoyé à plusieurs agents, un agent le lit, la requête « non-lu » ne le retourne plus pour
  lui mais encore pour les autres — toujours scopée à un seul workspace, sans exception à l'isolation (4.19, 20.4)
- **un rollup de santé runtime expose le détail nominatif des ressources dégradées, pas seulement leur compte**
  (17.8)
- **aucune détection automatique de panne ou de quota ne se fie au contenu généré par l'agent lui-même** — signal
  de niveau processus uniquement (7.15)
- **une Attempt ou une session ne peut être reprise que par le provider qui l'a produite** (4.8)
- **toute machine à états répond proprement à une transition déjà satisfaite ou invalide depuis un état
  terminal, sans jamais lever d'exception non gérée** (22.6)

---

*Fin de la Spécification*
