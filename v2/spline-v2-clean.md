# Spline — Architecture Specification (SAS)

**Version:** 2.0
**Status:** Draft
**Target:** V1 Implementation
**Language:** English (architecture) / French documentation allowed

> Réécriture de mise en forme de `spline-v2.md`. Aucune information, décision, champ, statut ou invariant n'a été
> ajouté, retiré ou modifié — seule la structure (titres, listes, blocs de code) a été nettoyée pour la lisibilité.

---

## 1. Vision

Spline est une plateforme de coordination, d'orchestration et de supervision permettant à des agents IA et des
humains de collaborer efficacement sur des projets complexes.

Spline ne cherche pas à remplacer les fournisseurs de modèles de langage.

Spline fournit une infrastructure commune permettant à plusieurs agents, provenant de fournisseurs différents, de
travailler ensemble selon un protocole partagé, un état partagé et des règles d'exécution déterministes.

Le système agit comme le **Control Plane** d'un environnement de travail agentique.

Les agents deviennent des workers spécialisés capables de coopérer sur un même objectif.

### 1.1 Vision long terme

Spline doit devenir le système d'exploitation du travail agentique.

De la même manière que Kubernetes orchestre des conteneurs, Spline orchestre des agents.

Le système doit permettre :

- plusieurs agents
- plusieurs fournisseurs
- plusieurs machines
- plusieurs dépôts Git
- plusieurs utilisateurs
- plusieurs organisations

sans perte de cohérence.

### 1.2 Ce que Spline n'est pas

Spline n'est pas :

- un LLM
- un chatbot
- un IDE
- un gestionnaire Git
- un framework d'agents
- un orchestrateur de prompts

Ces composants peuvent être intégrés à Spline mais ne définissent pas son identité.

### 1.3 Principes fondamentaux

**State First**
Le système repose sur un état partagé persistant. Les agents ne doivent jamais être la source de vérité.

**Control Plane**
Toutes les décisions critiques passent par le Control Plane. Aucun agent ne décide seul de l'état global.

**Provider Agnostic**
Tous les fournisseurs sont considérés comme interchangeables. Le protocole interne de Spline est indépendant des
modèles utilisés.

**Deterministic Infrastructure**
Les modèles sont probabilistes. L'infrastructure qui les entoure doit être déterministe.

**Human Supervision**
L'humain peut intervenir à tout instant. Le système ne suppose jamais une autonomie absolue.

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
- ses dépôts

**Goal Driven**
Un projet progresse vers des résultats. Pas uniquement vers des tâches.

**Observable**
Chaque action doit pouvoir être observée. Chaque décision doit pouvoir être expliquée. Chaque événement doit être
traçable.

---

## 2. Scope

### Inclus V1

- Control Plane
- Workspace Management
- Goal Management
- Task Graph
- Agent Management
- Runtime local
- Multi Provider
- Git Integration
- Artifact Management
- Validation Engine
- Resource Locks
- Audit
- Notification System
- Human Review
- Process Registry
- Event Bus
- Local Worker Runtime

### Exclus V1

- Auto Scaling Cloud
- Marketplace
- Distributed Scheduling mondial
- Federated Clusters
- Self Training Models
- Autonomous Long Running Organizations

---

## 3. Architecture Overview

Spline est organisé autour de deux catégories de composants. Le premier groupe décide. Le second exécute.

```text
                              User
                               │
                     Web / Mobile / API
                               │
                         Control Plane
        ┌──────────────────────────────────────────┐
        │  Workspace Service      Goal Engine       │
        │  Task Graph Engine      Scheduler          │
        │  Validation Engine      Lock Manager       │
        │  Audit                  Artifact Service   │
        │  Event Bus              Notification Svc   │
        │  Policy Engine                             │
        └──────────────────────────────────────────┘
                               │
                     Runtime Coordination
        ┌───────────────┬───────────────┬───────────────┐
        │               │               │
    Worker A         Worker B        Worker C
        │               │               │
   Claude Code        Codex        Gemini CLI
        │               │               │
      Git             Docker        Processes
```

Le Control Plane ne réalise jamais directement le travail. Il organise. Les Workers exécutent.

### 3.1 Couche Produit

**Applications :**

- Web
- Mobile
- API

**Responsabilités :**

- monitoring
- validation
- administration
- création de projets
- supervision

### 3.2 Control Plane

Le Control Plane est le cerveau du système. Il possède la totalité de l'état métier.

Il décide :

- quelle tâche existe
- qui peut l'exécuter
- quelles ressources sont disponibles
- quels locks existent
- quels objectifs sont atteints

Le Control Plane ne génère jamais de code.

### 3.3 Worker Runtime

Le Worker Runtime est installé sur une machine. Il est responsable de :

- lancer les agents
- lancer les commandes
- contrôler Git
- contrôler Docker
- gérer les processus
- publier les événements
- envoyer les heartbeats

Un worker peut exécuter plusieurs agents.

### 3.4 Agent Runtime

Chaque agent est exécuté dans une session indépendante. Une session possède :

- un contexte
- un provider
- un workspace
- un environnement
- un lease
- un état

Une session n'est jamais la source de vérité.

### 3.5 Repository Engine

Spline considère Git comme une entité métier. Chaque dépôt possède :

- un état
- une branche
- un commit courant
- des worktrees
- des validations
- des artefacts

Les modifications Git sont pilotées par Spline. Jamais directement par les agents.

### 3.6 Validation Engine

Une tâche n'est jamais terminée parce qu'un agent le déclare. Elle est terminée lorsque :

- les validations sont satisfaites
- les tests passent
- les politiques sont respectées
- les approbations sont obtenues

### 3.7 Event Bus

Toutes les communications passent par un bus d'événements. Les événements représentent des faits. Jamais des
intentions.

### 3.8 Scheduler

Le Scheduler décide :

- quel worker reçoit une tâche
- quand elle démarre
- quand elle est reprise
- quand elle est abandonnée

Le Scheduler ne réalise aucune exécution.

### 3.9 Policy Engine

Le Policy Engine applique les règles. Exemples :

- interdiction de pousser sur main
- validation obligatoire
- coût maximum
- timeout
- approbation humaine

Les politiques sont évaluées avant chaque action critique.

### 3.10 Observability

Chaque composant publie :

- logs
- métriques
- traces
- événements

Aucune action critique ne doit rester invisible.

### 3.11 Source of Truth

La source de vérité est toujours le Control Plane. Jamais :

- le LLM
- Git
- Redis
- le Runtime
- le Worker

Ces composants représentent un état dérivé. Leur état peut être reconstruit. Le Control Plane ne peut pas être
reconstruit à partir d'eux.

---

## 4. Domain Model

Le Domain Model définit les objets métier fondamentaux de Spline. Chaque composant du système est construit autour
de ces entités. Une entité représente une réalité métier persistante.

Elle possède :

- une identité
- un cycle de vie
- des relations
- des invariants
- un historique

Aucune logique métier ne doit dépendre directement des providers IA.

### 4.1 Hiérarchie

```text
Organization
└── Workspace
    ├── Repository
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
    ├── Event
    ├── Notification
    ├── ResourceLock
    ├── Policy
    └── AuditEntry
```

### 4.2 Workspace

Le Workspace représente l'unité d'isolation principale. Toutes les ressources appartiennent à exactement un
Workspace. Aucun état métier n'est partagé directement entre deux Workspaces.

**Champs**

- id
- organization_id
- name
- slug
- description
- status
- settings
- policies
- repositories
- goals
- workers
- artifacts
- notifications
- created_at
- updated_at

**Statuts**

- active
- archived
- paused
- deleted

**Invariants**

- un Workspace possède un propriétaire
- un Workspace possède au moins une politique
- un Workspace possède un audit permanent
- les ressources d'un Workspace sont isolées

### 4.3 Repository

Le Repository représente un dépôt Git. Spline considère Git comme une ressource métier. Git n'est jamais piloté
directement par un agent.

**Champs**

- id
- workspace_id
- provider
- remote_url
- default_branch
- credential_ref
- mirror_path
- status
- created_at
- updated_at

**Relations**

Un Repository possède :

- plusieurs branches
- plusieurs worktrees
- plusieurs validations
- plusieurs artefacts

### 4.4 Worktree

Un Worktree représente une copie de travail isolée. Chaque tâche possède son propre Worktree. Deux tâches ne
partagent jamais le même environnement Git.

**Champs**

- id
- repository_id
- task_id
- worker_id
- path
- base_commit
- branch
- status

**Statuts**

- preparing
- ready
- running
- validating
- archived

**Invariants**

Un Worktree appartient à exactement :

- une tâche
- un repository
- un worker

### 4.5 Goal

Un Goal représente un résultat observable. Un Goal décrit ce qui doit être atteint. Jamais comment.

**Champs**

- id
- workspace_id
- parent_goal_id
- title
- description
- success_criteria
- priority
- owner
- progress
- status
- created_at
- updated_at

**Statuts**

- planned
- active
- blocked
- review
- completed
- cancelled

**Invariants**

Un Goal :

- possède des critères de succès
- peut contenir plusieurs tâches
- peut contenir plusieurs sous-objectifs
- ne peut être terminé sans validation

### 4.6 Task

Une Task représente une unité atomique de travail. Une Task possède un seul responsable. Les collaborateurs
éventuels interviennent via des tâches séparées.

**Champs**

- id
- workspace_id
- goal_id
- repository_id
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

**Statuts**

- planned
- ready
- assigned
- running
- blocked
- validating
- completed
- failed
- cancelled

**Invariants**

Une Task :

- possède un Goal
- possède un propriétaire
- possède un état
- possède des critères d'acceptation

### 4.7 Run

Un Run représente une exécution logique. Une même tâche peut être exécutée plusieurs fois. Chaque tentative crée un
nouveau Run.

**Champs**

- id
- task_id
- worker_id
- status
- started_at
- finished_at

**Statuts**

- pending
- running
- validating
- completed
- failed

### 4.8 Attempt

Une Attempt représente une tentative d'exécution. Elle permet :

- les retries
- les reprises
- les statistiques

**Champs**

- id
- run_id
- number
- provider
- model
- prompt_version
- token_usage
- cost
- duration
- outcome

### 4.9 Validation

Une Validation représente une preuve. Une tâche n'est jamais terminée sans preuve.

**Champs**

- id
- task_id
- validation_type
- status
- output
- executed_by
- created_at

**Types**

- build
- unit_test
- integration_test
- lint
- security_scan
- human_review
- policy_check

### 4.10 Artifact

Un Artifact représente un objet produit.

**Exemples**

- fichier
- capture
- log
- rapport
- diff
- document
- décision
- archive

**Champs**

- id
- workspace_id
- task_id
- repository_id
- type
- version
- checksum
- storage_ref
- metadata

### 4.11 WorkerNode

Le WorkerNode représente une machine d'exécution.

**Champs**

- id
- hostname
- labels
- architecture
- operating_system
- capabilities
- health
- last_heartbeat
- status

**Statuts**

- online
- offline
- draining
- maintenance

### 4.12 AgentSession

Une AgentSession représente une instance vivante d'un agent. Une session est éphémère. L'Agent est permanent.

**Champs**

- id
- agent_id
- worker_id
- provider
- model
- workspace_id
- state
- lease_id
- started_at

**Statuts**

- starting
- idle
- running
- waiting
- stopped
- crashed

### 4.13 Lease

Le Lease protège une exécution. Si le Worker disparaît, le Lease expire. La tâche peut être reprise.

**Champs**

- id
- owner
- resource
- acquired_at
- expires_at
- renewed_at

### 4.14 RuntimeProcess

Représente un processus système.

**Exemples**

- serveur
- docker
- npm
- go run

**Champs**

- id
- worker_id
- workspace_id
- pid
- command
- cwd
- status
- ports
- owner

### 4.15 ResourceLock

Protège une ressource. Jamais une tâche complète.

**Types**

- process
- file
- directory
- repository
- branch
- port
- environment

**Champs**

- id
- resource
- owner
- lease
- reason
- acquired_at
- expires_at

### 4.16 Decision

Une Decision représente un choix métier. Elle permet d'expliquer pourquoi une action a été prise.

**Champs**

- id
- workspace_id
- task_id
- author
- rationale
- alternatives
- outcome
- confidence

### 4.17 Blocker

Représente un obstacle. Une tâche bloquée ne progresse plus.

**Types**

- technical
- dependency
- approval
- infrastructure
- human
- external

### 4.18 Notification

Représente une information destinée à un acteur. Une Notification possède plusieurs destinataires. Chaque
destinataire possède son propre état.

**Champs**

- id
- workspace_id
- type
- title
- payload
- sender
- created_at

### 4.19 Event

Un Event représente un fait. Jamais une intention.

**Exemples**

- TaskStarted
- TaskCompleted
- TaskFailed
- WorkerOffline
- LeaseExpired
- ValidationSucceeded
- ValidationFailed
- ArtifactCreated
- RepositoryUpdated
- MergeCompleted

### 4.20 AuditEntry

Toute action importante génère une entrée d'audit. L'audit est immuable.

**Champs**

- id
- actor
- action
- target
- before
- after
- timestamp
- signature

### 4.21 Invariants Globaux

Les invariants suivants sont garantis par Spline.

- Une tâche possède exactement un propriétaire.
- Un Worktree appartient exactement à une tâche.
- Une Validation appartient exactement à un Run.
- Un Lease protège exactement une ressource.
- Un Lock ne peut exister sans Lease.
- Une Session appartient exactement à un Worker.
- Un Worker peut exécuter plusieurs Sessions.
- Une tâche n'est jamais terminée sans Validation.
- Le Control Plane reste toujours la source de vérité.
- Aucun provider IA ne peut modifier directement l'état métier.

---

## 5. Control Plane

Le Control Plane constitue le cœur de Spline. Il est responsable de l'état global du système. Aucun composant ne
peut modifier directement l'état métier sans passer par le Control Plane.

Le Control Plane ne réalise jamais le travail opérationnel. Il décide. Les Workers exécutent.

### 5.1 Responsabilités

Le Control Plane est responsable de :

- la gestion des Workspaces
- la gestion des Repositories
- la gestion des Goals
- la gestion des Tasks
- l'orchestration des Workers
- l'allocation des ressources
- la coordination des agents
- la validation
- l'audit
- les notifications
- les politiques
- les événements
- la persistance

### 5.2 Principes

Le Control Plane est :

- stateless vis-à-vis des providers
- stateful vis-à-vis du domaine métier

Le Control Plane ne connaît jamais :

- les prompts internes d'un provider
- les conversations internes d'un LLM
- les détails d'implémentation d'un runtime

Il connaît uniquement :

- les capacités
- les états
- les tâches
- les résultats

### 5.3 Architecture

```text
                     API
                      │
                      ▼
                Control Plane
                      │
    ├──────── Workspace Service
    ├──────── Repository Service
    ├──────── Goal Engine
    ├──────── Task Engine
    ├──────── Scheduler
    ├──────── Validation Engine
    ├──────── Policy Engine
    ├──────── Lock Manager
    ├──────── Notification Service
    ├──────── Artifact Service
    ├──────── Audit Service
    └──────── Event Bus
```

### 5.4 Workspace Service

**Responsabilités**

- création
- archivage
- duplication
- configuration
- permissions
- règles

Le Workspace Service ne gère jamais les tâches.

### 5.5 Repository Service

**Responsabilités**

- enregistrer les dépôts
- créer les worktrees
- suivre les branches
- suivre les commits
- préparer les environnements Git
- publier les changements

Il ne réalise jamais de merge.

### 5.6 Goal Engine

**Responsabilités**

- création des objectifs
- hiérarchie
- progression
- dépendances
- calcul du pourcentage
- clôture

Le Goal Engine ne connaît jamais les providers.

### 5.7 Task Engine

**Responsabilités**

- création
- assignation
- dépendances
- blocages
- exécution
- validation

Une Task appartient toujours à un Goal.

### 5.8 Scheduler

Le Scheduler est responsable de l'allocation des tâches.

**Entrées**

- workers disponibles
- capacités
- coût
- priorité
- dépendances

**Sorties**

- assignation
- attente
- reprise
- annulation

### 5.9 Validation Engine

Le Validation Engine décide si une tâche peut être considérée comme terminée. Une tâche est validée uniquement si :

- toutes les validations requises sont réussies
- toutes les politiques sont satisfaites
- les approbations sont obtenues

### 5.10 Policy Engine

Le Policy Engine applique les règles du Workspace.

**Exemples**

Interdire :

- push sur main
- suppression d'une branche
- accès production
- modification des secrets

Obliger :

- review
- lint
- tests
- couverture minimale

### 5.11 Lock Manager

Le Lock Manager garantit l'exclusivité. Il protège :

- fichiers
- branches
- ports
- processus
- environnements

Les locks sont toujours temporaires. Ils expirent.

### 5.12 Artifact Service

**Responsabilités**

- stockage logique
- version
- relations
- recherche
- historique

Un Artifact n'est jamais supprimé sans audit.

### 5.13 Notification Service

**Responsabilités**

- messages
- alertes
- demandes de validation
- diffusion
- accusés

Le Notification Service ne transporte jamais les événements système.

### 5.14 Audit Service

Chaque modification importante génère une entrée. Aucune entrée ne peut être supprimée.

### 5.15 Event Bus

Toutes les communications passent par le bus. Le bus est responsable de :

- diffusion
- persistance
- retries
- ordering
- replay

### 5.16 Source de vérité

Le Control Plane est la seule autorité. Le Runtime ne peut jamais modifier directement :

- une Task
- un Goal
- un Lock
- une Validation

Il soumet une requête. Le Control Plane décide.

---

## 6. Worker Runtime

Le Worker Runtime est le composant installé sur une machine. Il exécute les décisions prises par le Control Plane.

### 6.1 Responsabilités

Le Worker Runtime :

- lance les agents
- exécute les commandes
- contrôle Git
- contrôle Docker
- surveille les processus
- remonte les événements
- renouvelle les leases
- envoie les heartbeats

### 6.2 Cycle de vie

```text
OFFLINE → CONNECTING → REGISTERING → READY → RUNNING → DRAINING → OFFLINE
```

### 6.3 Enregistrement

Au démarrage, un Worker envoie :

- hostname
- architecture
- OS
- mémoire
- CPU
- GPU
- runtimes disponibles
- providers disponibles
- version

Le Control Plane retourne :

- Worker ID
- Policies
- Workspace autorisés

### 6.4 Heartbeat

Chaque Worker publie régulièrement :

- charge CPU
- mémoire
- disque
- tâches
- sessions
- santé

Si aucun heartbeat n'est reçu avant expiration du délai, le Worker est considéré comme indisponible.

### 6.5 Lease

Toute tâche active possède un Lease. Le Lease protège l'exécution.

```text
Worker → Acquire Lease → Execute → Renew Lease → Release Lease
```

Si le Lease expire :

- la tâche est suspendue
- le lock est libéré
- le Scheduler peut réassigner

### 6.6 Crash Recovery

Lorsqu'un Worker disparaît, le Control Plane :

- détecte l'absence
- expire les leases
- marque les sessions perdues
- conserve les artefacts
- replace les tâches dans la file

Aucune tâche ne doit disparaître.

### 6.7 Isolation

Chaque tâche possède :

- son Worktree
- son environnement
- ses variables
- ses logs
- ses processus

Deux tâches ne partagent jamais un environnement.

### 6.8 Runtime API

Le Runtime expose :

- ExecuteTask
- CancelTask
- Heartbeat
- AcquireLease
- ReleaseLease
- PublishEvent
- UploadArtifact
- ListProcesses
- KillProcess
- CreateWorktree
- DeleteWorktree

### 6.9 Runtime State

Le Runtime maintient uniquement un état local. En cas de divergence, le Control Plane fait autorité. Le Runtime doit
se resynchroniser.

### 6.10 Sécurité

Le Runtime ne reçoit jamais :

- les secrets des autres Workspaces
- les politiques des autres organisations
- les tâches étrangères

Toutes les autorisations sont limitées au Workspace courant.

---

## 7. Agent Runtime

L'Agent Runtime représente l'environnement d'exécution logique d'un agent. Il constitue l'interface entre le
provider IA et Spline. Le Runtime traduit les décisions du Control Plane en actions exécutables. Le Runtime ne
possède jamais l'état métier. Il exécute.

### 7.1 Responsabilités

L'Agent Runtime est responsable de :

- démarrer une session
- préparer le contexte
- charger les outils
- communiquer avec le provider
- exécuter les actions
- produire des artefacts
- publier les événements
- terminer proprement la session

### 7.2 Cycle de vie

```text
CREATED → INITIALIZING → SYNCING → READY → EXECUTING → WAITING → EXECUTING → COMPLETED → TERMINATED
```

En cas d'erreur :

```text
EXECUTING → FAILED → RETRYING → EXECUTING
```

ou

```text
FAILED → TERMINATED
```

### 7.3 Initialisation

Avant toute exécution, le Runtime :

- récupère la configuration
- récupère les politiques
- récupère les permissions
- récupère les objectifs
- récupère la tâche
- récupère les artefacts nécessaires

Le Runtime ne démarre jamais sans synchronisation complète.

### 7.4 Synchronisation

Chaque session commence par un Sync. Le Sync récupère :

- Workspace State
- Task State
- Goal State
- Locks
- Policies
- Repository State
- Validation State

L'agent ne peut agir qu'après cette étape.

### 7.5 Contexte

Le contexte d'un agent est composé de plusieurs couches.

```text
Workspace Context → Project Context → Goal Context → Task Context → Execution Context
```

Chaque couche enrichit la suivante. Le contexte est reconstruit à chaque exécution.

### 7.6 Mémoire

Spline distingue plusieurs mémoires.

**Workspace Memory** — architecture générale, décisions, conventions, documentation.

**Goal Memory** — informations utiles au Goal courant.

**Task Memory** — informations strictement nécessaires à la tâche.

**Session Memory** — contexte temporaire, supprimé à la fin de la session.

### 7.7 Outils

Les outils sont fournis par le Runtime.

**Exemples :**

- Git
- Terminal
- Docker
- Browser
- MCP
- Filesystem
- Search
- Diff
- Logs

Les outils ne sont jamais appelés directement. Chaque appel passe par le Runtime.

### 7.8 Permissions

Chaque outil possède ses permissions.

**Exemple**

```text
Git: Read, Write, Commit, Branch, Merge, Push
```

Le Runtime vérifie les permissions avant chaque appel.

### 7.9 Sandbox

Chaque session s'exécute dans un environnement isolé.

**Isolation :**

- fichiers
- variables
- processus
- réseau
- worktree

Une session ne peut pas accéder aux ressources d'une autre.

### 7.10 Prompts

Spline ne stocke jamais des prompts arbitraires. Le Runtime construit le prompt à partir :

- du Workspace
- du Goal
- de la Task
- des Policies
- des Artefacts
- des Capacités

Le prompt est considéré comme un artefact dérivé.

### 7.11 Réponses

Les réponses libres ne modifient jamais l'état. Pour modifier le système, l'agent doit produire une Action.

**Exemple**

```text
PublishEvent, CreateArtifact, UpdateTask, AcquireLock, ReleaseLock, StartProcess, StopProcess
```

Le Runtime traduit ensuite cette Action.

### 7.12 Validation

Avant d'exécuter une Action :

- validation syntaxique
- validation permissions
- validation politiques
- validation ressources

Seulement ensuite : Action exécutée.

### 7.13 Fin de session

Une session se termine lorsque :

- la tâche est terminée
- une erreur est fatale
- un timeout est atteint
- l'utilisateur annule
- le Worker disparaît

Toutes les ressources sont libérées.

---

## 8. Repository Engine

Le Repository Engine constitue le cœur du travail logiciel. Git est considéré comme une ressource métier. Les
agents ne manipulent jamais directement Git. Ils demandent des opérations. Le Repository Engine les réalise.

### 8.1 Responsabilités

Le Repository Engine gère :

- repositories
- branches
- worktrees
- commits
- merges
- conflits
- validations
- synchronisation

### 8.2 Repository

Un Repository possède :

- une origine
- une branche principale
- plusieurs worktrees
- plusieurs branches
- plusieurs tâches

### 8.3 Branches

Chaque tâche possède sa propre branche.

**Convention :**

```text
task/<task-id>
goal/<goal-id>
agent/<session-id>
```

Aucune tâche ne travaille directement sur `main`, `master`, `develop`.

### 8.4 Worktrees

Chaque tâche possède un Worktree.

```text
Repository → Worktree → Task → Run
```

Deux tâches ne partagent jamais le même Worktree.

### 8.5 Cycle

```text
Clone → Worktree → Checkout → Execute → Validate → Commit → Merge → Archive
```

### 8.6 Commits

Chaque commit produit par un agent contient :

- Task ID
- Goal ID
- Run ID
- Session ID
- Provider
- Timestamp

### 8.7 Merge

Le merge n'est jamais réalisé par un agent. Le Repository Engine décide.

**Conditions :**

- validations réussies
- politiques satisfaites
- aucun conflit
- approbations obtenues

### 8.8 Conflits

Les conflits sont classés.

**Types**

- fichier
- dépendance
- politique
- merge
- validation
- architecture

### 8.9 Résolution

Le système tente :

```text
Automatic → Needs Review → Human Review
```

Un conflit non résolu bloque la tâche.

### 8.10 Validation Git

Avant chaque merge :

- Build
- Tests
- Lint
- Security
- Policy
- Review

Tous les contrôles doivent réussir.

### 8.11 Protection

Le Repository Engine interdit :

- push direct sur main
- suppression de branches protégées
- modification des hooks
- modification des secrets
- modification de l'historique

### 8.12 Artefacts Git

Chaque exécution produit :

- diff
- logs
- commits
- rapports
- résultats

Ces éléments deviennent des Artifacts versionnés.

### 8.13 Historique

Toutes les opérations Git sont historisées.

**Exemples**

- RepositoryCreated
- BranchCreated
- WorktreeCreated
- CommitCreated
- MergeRequested
- MergeCompleted
- MergeRejected
- ConflictDetected
- ConflictResolved

---

## 9. Scheduling Engine

Le Scheduling Engine est responsable de l'allocation du travail. Son objectif est de transformer un ensemble de
Goals en exécutions ordonnées. Il ne réalise jamais le travail. Il décide où et quand il sera exécuté.

### 9.1 Responsabilités

Le Scheduler est responsable de :

- l'allocation des tâches
- l'ordonnancement
- les dépendances
- les priorités
- les retries
- la reprise après panne
- l'équilibrage de charge
- l'utilisation optimale des Workers

### 9.2 Objectifs

Le Scheduler cherche à optimiser :

- le temps total d'exécution
- l'utilisation des Workers
- le coût
- la disponibilité
- le parallélisme
- la robustesse

### 9.3 Entrées

Le Scheduler reçoit :

- les Goals
- les Tasks
- les dépendances
- les Workers
- les capacités
- les Policies
- les contraintes

### 9.4 Sorties

Le Scheduler produit :

- une assignation
- un ordre d'exécution
- une réservation
- une file d'attente
- une estimation

### 9.5 DAG

Les tâches sont représentées sous forme d'un graphe orienté acyclique.

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

**États exceptionnels**

- BLOCKED
- FAILED
- RETRYING
- CANCELLED
- PAUSED
- WAITING_APPROVAL

### 9.7 Priorités

Chaque tâche possède une priorité.

**Valeurs :**

- Critical
- High
- Normal
- Low
- Background

Le Scheduler utilise cette priorité lors de l'allocation.

### 9.8 Contraintes

Une tâche peut imposer :

- un système d'exploitation
- une architecture CPU
- un GPU
- un provider
- un runtime
- une mémoire minimale
- une localisation
- un accès réseau

### 9.9 Capacités

Chaque Worker publie ses capacités.

**Exemple**

```text
Docker, Go, NodeJS, Rust, Python, GPU, Claude, Codex, Gemini
```

Une tâche ne peut être assignée qu'à un Worker compatible.

### 9.10 Affinité

Une tâche peut préférer :

- un Worker
- une Machine
- un Provider
- un Repository

sans que cela soit obligatoire.

### 9.11 Réservation

Avant l'exécution, le Scheduler réserve :

- le Worker
- le Worktree
- les ressources
- le Lease

### 9.12 Retry

Une tâche échouée peut être relancée. Chaque Retry crée :

- un nouveau Run
- une nouvelle Attempt

L'historique est conservé.

### 9.13 Timeout

Chaque tâche possède un délai maximal. En cas de dépassement :

- la session est arrêtée
- le Lease expire
- la tâche passe en échec ou retry

### 9.14 Préemption

Une tâche critique peut interrompre une tâche moins prioritaire.

**Conditions :**

- Lease récupérable
- état sauvegardé
- reprise possible

### 9.15 Scheduler Events

Le Scheduler publie notamment :

- TaskScheduled
- TaskAssigned
- TaskQueued
- TaskRetried
- TaskCancelled
- TaskPreempted
- WorkerSelected
- WorkerRejected

---

## 10. Collaboration Protocol

Spline définit un protocole obligatoire. Tous les agents suivent exactement le même cycle. Aucun provider n'est
autorisé à définir son propre protocole.

### 10.1 Objectifs

Le protocole garantit :

- cohérence
- reproductibilité
- audit
- coordination
- reprise

### 10.2 Cycle général

```text
Synchronize → Read → Plan → Acquire → Execute → Validate → Publish → Release → Await
```

### 10.3 Synchronize

Avant toute action, l'agent récupère :

- Workspace
- Task
- Goal
- Locks
- Policies
- Repository
- Events

### 10.4 Read

L'agent lit :

- les Artefacts
- les Décisions
- les Blockers
- les Notifications

### 10.5 Plan

Avant d'agir, l'agent produit un plan. Le plan contient :

- objectif
- ressources
- risques
- sorties attendues

Le plan devient un Artifact.

### 10.6 Acquire

Avant toute modification, l'agent demande :

- les Locks
- le Lease
- le Worktree

Sans autorisation : aucune action.

### 10.7 Execute

Pendant cette phase, l'agent :

- exécute
- produit
- modifie
- compile
- teste

Toutes les actions passent par le Runtime.

### 10.8 Publish

Après chaque étape importante, l'agent publie :

- progression
- résultats
- blocages
- nouveaux artefacts

Le système interdit les longues exécutions silencieuses.

### 10.9 Validate

L'agent demande Validation. Il ne décide jamais lui-même que son travail est terminé.

### 10.10 Release

Toutes les ressources sont libérées :

- Locks
- Lease
- Worktree temporaire
- Processus temporaires

### 10.11 Await

La session reste disponible. Elle attend :

- une nouvelle tâche
- une validation
- une annulation

### 10.12 Communications

Toutes les communications utilisent des événements structurés. Jamais du texte libre.

**Exemple**

```json
{ "type": "...", "actor": "...", "task": "...", "goal": "...", "action": "...", "timestamp": "...", "payload": {} }
```

### 10.13 Intentions

Les intentions sont publiées avant une action importante.

**Exemples**

- IntentStartTask
- IntentModifyRepository
- IntentMergeBranch
- IntentRestartProcess
- IntentDeleteArtifact

### 10.14 Résultats

Après exécution, l'agent publie :

- TaskProgress
- TaskCompleted
- TaskFailed
- ArtifactCreated
- ValidationRequested
- BlockerDetected

### 10.15 Blocages

Tout blocage devient une entité métier. Il possède :

- une cause
- un auteur
- une gravité
- une solution proposée

### 10.16 Violations

Une session est considérée hors protocole lorsqu'elle :

- modifie sans Lock
- ignore les Policies
- agit sans Synchronize
- conserve un Lease expiré
- ne publie aucun résultat

Le Runtime peut interrompre cette session.

### 10.17 Garanties

Spline garantit :

- aucune tâche sans propriétaire
- aucun travail sans Worktree
- aucune action sans audit
- aucune modification sans validation
- aucun provider privilégié
- aucune communication non structurée

---

## 11. Validation Engine

Le Validation Engine est responsable de déterminer objectivement si une tâche, un Goal ou une modification du
système peut être considéré comme terminé. Les agents ne peuvent jamais déclarer eux-mêmes une réussite. Ils
soumettent des résultats. Le Validation Engine décide.

### 11.1 Principes

Toute validation est :

- reproductible
- observable
- historisée
- indépendante du provider
- configurable

### 11.2 Types de validation

Spline distingue plusieurs catégories.

**Validation Technique** — compilation, exécution, lint, formatage, dépendances, sécurité.

**Validation Fonctionnelle** — critères d'acceptation, comportement attendu, exigences métier.

**Validation Humaine** — représente une approbation. Elle peut être obligatoire.

**Validation Automatique** — réalisée par le système (CI, tests, scanners, politiques).

**Validation Agentique** — réalisée par un autre agent spécialisé : Review Agent, Security Agent, Performance
Agent, Architecture Agent, Documentation Agent.

### 11.3 Pipeline

Une validation suit toujours le pipeline suivant.

```text
Request → Prepare → Execute → Collect → Evaluate → Publish → Complete
```

### 11.4 Validation Request

Une demande de validation contient :

- ressource
- type
- politiques
- artefacts
- auteur
- contexte

### 11.5 Validation Result

Une validation produit :

- statut
- durée
- rapport
- métriques
- erreurs
- recommandations

### 11.6 Statuts

- Pending
- Running
- Succeeded
- Failed
- Cancelled
- Skipped

### 11.7 Conditions de réussite

Une tâche devient VALIDATED uniquement si :

- toutes les validations obligatoires réussissent
- aucune politique n'est violée
- toutes les approbations existent
- tous les blocages sont levés

### 11.8 Revalidation

Toute modification importante invalide automatiquement les validations précédentes.

**Exemples :**

- nouveau commit
- modification d'un fichier
- changement de politique
- changement de dépendance

### 11.9 Validation Graph

Les validations possèdent également un graphe.

```text
Build → Unit Tests → Integration Tests → Security → Architecture Review → Human Approval
```

Une étape ne démarre que lorsque les précédentes sont terminées.

### 11.10 Rapports

Chaque validation produit un Artifact.

**Exemples**

- Build Report
- Coverage Report
- Security Report
- Performance Report
- Review Report

---

## 12. Policy Engine

Le Policy Engine définit les règles du Workspace. Les politiques sont déclaratives. Les agents ne peuvent pas les
contourner.

### 12.1 Objectifs

Les politiques permettent de définir :

- les autorisations
- les interdictions
- les limites
- les obligations

### 12.2 Hiérarchie

Les politiques sont héritées.

```text
Organization → Workspace → Repository → Goal → Task
```

Une politique plus spécifique surcharge une politique plus générale.

### 12.3 Types

**Security Policies** — accès réseau, accès internet, secrets, fichiers protégés.

**Runtime Policies** — timeout, mémoire maximale, CPU, GPU.

**Git Policies** — branches protégées, merge obligatoire, review obligatoire, signature des commits.

**Validation Policies** — build obligatoire, couverture minimale, sécurité obligatoire.

**Cost Policies** — coût maximal, nombre maximal de tokens, nombre maximal d'appels.

### 12.4 Évaluation

Avant chaque Action :

```text
Action → Policy Engine → Allowed ? → Yes → Execution
```

Sinon : `Denied`.

### 12.5 Violations

Toute violation génère :

- un Event
- une entrée Audit
- une Notification

Une violation peut également suspendre une Session.

---

## 13. Lock Manager

Le Lock Manager protège les ressources critiques. Les Locks sont distribués. Ils possèdent toujours une durée de
vie.

### 13.1 Ressources

Un Lock peut protéger :

- fichier
- dossier
- branche
- Worktree
- Process
- Port
- Environment
- Secret
- Repository

### 13.2 Cycle

```text
Acquire → Granted → Renew → Release
```

ou

```text
Acquire → Rejected
```

### 13.3 Lease

Chaque Lock est associé à un Lease. Sans Lease valide, le Lock est automatiquement supprimé.

### 13.4 Conflits

Deux demandes concurrentes produisent : `Granted`, `Waiting`, ou `Rejected`, selon la politique.

### 13.5 Expiration

Les Locks expirent automatiquement. Ils ne peuvent jamais rester permanents.

### 13.6 Recovery

Après un crash, le Lock Manager :

- détecte les Leases expirés
- supprime les Locks
- notifie le Scheduler

---

## 14. Event Bus

Le Event Bus constitue le système nerveux de Spline. Tous les composants communiquent uniquement au travers
d'événements.

### 14.1 Caractéristiques

Les événements sont :

- persistants
- ordonnés
- versionnés
- rejouables
- immuables

### 14.2 Catégories

Workspace, Goal, Task, Worker, Session, Validation, Repository, Artifact, Notification, Audit, Policy, Lock.

### 14.3 Publication

Chaque événement est publié une seule fois. Les consommateurs décident ensuite de leur traitement.

### 14.4 Replay

Le système peut rejouer les événements. Cette fonctionnalité permet :

- reprise après panne
- debugging
- reconstruction
- audit

### 14.5 Garanties

Le Event Bus garantit :

- ordre
- persistance
- livraison
- traçabilité

---

## 15. Artifact System

Les Artifacts représentent tous les objets produits par Spline. Ils constituent la mémoire durable du projet.

### 15.1 Types

Documents, Logs, Diffs, Commits, Captions, Reports, Screenshots, Specifications, Benchmarks, Plans, Metrics,
Models, Bundles.

### 15.2 Versionnement

Chaque modification produit une nouvelle version. Les anciennes versions restent consultables.

### 15.3 Relations

Un Artifact peut être lié à :

- Workspace
- Repository
- Goal
- Task
- Run
- Validation
- Event
- Decision

### 15.4 Stockage

Le système sépare Métadonnées et Contenu. Le contenu peut être stocké :

- localement
- dans un Object Storage
- dans Git
- dans une base documentaire

### 15.5 Cycle de vie

```text
Created → Versioned → Linked → Archived → Deleted
```

La suppression peut être interdite par les politiques.

### 15.6 Recherche

Les Artifacts sont indexés. Recherche possible par :

- type
- auteur
- Goal
- Task
- Repository
- date
- tags
- contenu

### 15.7 Immutabilité

Certains Artifacts deviennent immuables.

**Exemples :**

- Audit
- Validation Report
- Signed Report
- Release Bundle

---

## 16. Memory System

Le Memory System fournit aux agents un accès cohérent à la connaissance du projet. La mémoire n'est jamais une
simple base vectorielle. Spline distingue plusieurs niveaux de mémoire répondant à des besoins différents.

### 16.1 Principes

La mémoire est :

- persistante
- versionnée
- contextualisée
- observable
- requêtable
- indépendante des providers

Aucune mémoire ne constitue la source de vérité. La source de vérité reste le Domain Model.

### 16.2 Hiérarchie

```text
Organization Memory → Workspace Memory → Repository Memory → Goal Memory → Task Memory → Run Memory → Session Memory
```

### 16.3 Workspace Memory

Contient : architecture, conventions, documentation, décisions, politiques, historique.

### 16.4 Repository Memory

Contient : structure, modules, conventions Git, historique architectural, ADR, dépendances.

### 16.5 Goal Memory

Contient : objectifs, contraintes, décisions, avancement.

### 16.6 Task Memory

Contient uniquement : ressources utiles, fichiers concernés, dépendances, blocages, résultats précédents.

### 16.7 Run Memory

Contient : événements, logs, artefacts, validations, erreurs.

### 16.8 Session Memory

Mémoire temporaire. Elle disparaît à la fin de la Session. Elle ne doit jamais contenir d'information critique.

### 16.9 Indexation

Toutes les mémoires sont indexées. Recherche possible selon : type, date, auteur, Goal, Task, Repository, tags.

### 16.10 Reconstruction

Toute mémoire peut être reconstruite à partir :

- des Artifacts
- des Events
- des Decisions
- des Repositories

---

## 17. Observability

Spline est conçu pour être entièrement observable. Aucun composant ne fonctionne comme une boîte noire.

### 17.1 Objectifs

Permettre : supervision, audit, debugging, optimisation, reprise.

### 17.2 Logs

Chaque composant produit : logs système, logs métier, logs runtime, logs provider.

### 17.3 Metrics

Chaque composant publie : CPU, mémoire, durée, coût, nombre de tâches, validations, retries, erreurs.

### 17.4 Traces

Une Trace représente une exécution complète.

```text
Goal → Task → Run → Session → Provider → Validation
```

### 17.5 Dashboards

Spline fournit des tableaux de bord pour : Workspaces, Workers, Providers, Goals, Tasks, Runtime, Validation, Git.

### 17.6 Health

Chaque composant expose un état.

**Valeurs**

- Healthy
- Warning
- Degraded
- Unhealthy

### 17.7 Alertes

**Exemples**

- Worker Offline
- Lease Expired
- Validation Failed
- Policy Violation
- Repository Conflict
- Provider Unavailable
- Runtime Crash

---

## 18. Security

La sécurité est appliquée à tous les niveaux.

### 18.1 Principes

Least Privilege, Zero Trust, Defense in Depth, Audit First, Isolation.

### 18.2 Authentification

Les acteurs sont : Humans, Agents, Workers, Services. Chaque acteur possède une identité.

### 18.3 Autorisation

Toutes les opérations passent par RBAC. Les permissions sont évaluées avant toute action.

### 18.4 Secrets

Les secrets ne sont jamais transmis directement aux agents. Le Runtime fournit uniquement les secrets nécessaires à
la tâche.

### 18.5 Isolation

Isolation entre : Workspaces, Repositories, Worktrees, Sessions, Providers.

### 18.6 Sandbox

Les sessions peuvent être exécutées dans : Docker, VM, Sandbox Provider, Process isolé.

### 18.7 Audit

Toutes les opérations sensibles sont historisées.

**Exemples**

Merge, Delete, Policy Update, Permission Change, Secret Access.

---

## 19. API

Toutes les fonctionnalités de Spline sont accessibles par API. L'API constitue l'interface officielle du système.

### 19.1 Principes

REST, Streaming, WebSocket, Event Driven.

### 19.2 Ressources

```text
/organizations   /workspaces     /repositories   /goals
/tasks           /runs           /attempts       /workers
/sessions        /locks          /events         /artifacts
/notifications   /policies       /validations    /audit
```

### 19.3 Opérations

Toutes les ressources supportent Create, Read, Update, Delete — lorsque cela est autorisé.

### 19.4 Streaming

Les événements sont diffusés en temps réel.

**Exemples**

Task Updated, Worker Offline, Validation Completed, Lease Expired.

---

## 20. Runtime Protocol

Le Runtime Protocol définit la communication entre le Control Plane et les Workers.

### 20.1 Cycle

```text
Register → Authenticate → Synchronize → Heartbeat → Receive Task → Execute → Publish → Complete
```

### 20.2 Heartbeat

Chaque Worker envoie régulièrement : état, charge, sessions, leases, runtime version.

### 20.3 Synchronisation

Le Runtime synchronise : Policies, Workspace, Tasks, Locks, Repositories.

### 20.4 Déconnexion

En cas de perte de connexion, le Runtime tente une reconnexion. Si le délai est dépassé, les Leases expirent.

---

## 21. State Machines

Toutes les entités critiques possèdent une machine à états.

### 21.1 Task

```text
Planned → Ready → Assigned → Running → Validating → Completed
```

Exceptions : `Blocked`, `Failed`, `Cancelled`.

### 21.2 Worker

```text
Offline → Registering → Ready → Running → Draining → Offline
```

### 21.3 Session

```text
Created → Ready → Executing → Waiting → Completed
```

### 21.4 Validation

```text
Pending → Running → Succeeded
```

ou

```text
Pending → Running → Failed
```

### 21.5 Repository

```text
Created → Ready → Working → Validating → Merged → Archived
```

---

## 22. Failure Recovery

Spline est conçu pour survivre aux pannes.

### 22.1 Pannes

Le système doit supporter :

- crash Worker
- crash Runtime
- perte réseau
- redémarrage
- indisponibilité Provider

### 22.2 Reprise

Le Scheduler détecte les Leases expirés. Les tâches sont réassignées. Les artefacts restent disponibles.

### 22.3 Checkpoints

Les longues exécutions produisent des Checkpoints. Ils permettent une reprise.

### 22.4 Retry

Les retries sont contrôlés. Ils sont historisés. Ils créent toujours une nouvelle Attempt.

---

## 23. Deployment

Spline peut être déployé : Local, Docker, Kubernetes, On Premise, Cloud.

### 23.1 Composants

Control Plane, API, Database, Redis, Workers, Runtime, Storage.

### 23.2 Scalabilité

Le Control Plane est horizontalement scalable. Les Workers peuvent être ajoutés dynamiquement.

### 23.3 Haute disponibilité

Les services critiques peuvent être répliqués. La perte d'un Worker ne provoque pas la perte des tâches.

---

## 24. Future Extensions

Évolutions prévues :

- Multi Organization
- Federated Clusters
- Cloud Workers
- GPU Scheduling
- Marketplace
- Autonomous Organizations
- Multi Repository DAG
- Multi Cluster Scheduling
- Cost Optimizer
- Learning Engine
- Capability Marketplace

---

## 25. Success Criteria

Spline est considéré conforme lorsque :

- plusieurs providers collaborent sans modification de l'architecture
- plusieurs Workers exécutent des tâches simultanément
- les tâches survivent aux pannes
- Git reste cohérent
- les validations sont systématiques
- les politiques sont appliquées
- toutes les actions sont auditables
- les artefacts sont versionnés
- les événements sont persistés
- le système peut être reconstruit à partir de son état métier
- aucun provider n'est privilégié
- le Control Plane reste l'unique source de vérité
- chaque composant est observable
- chaque décision est traçable
- chaque exécution est reproductible

---

*Fin de la Spécification*
