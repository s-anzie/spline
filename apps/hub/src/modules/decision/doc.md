# Decision — Conception détaillée

> Module : `apps/hub/src/modules/decision/`
> Référence spec : `v3/spline-v3.md` — §4.17 (entité), §4.1 (Decision sous Task), §15.3 (un Artifact se
> lie à une Decision), §16.3 et §16.10 (la mémoire contient les décisions et se reconstruit à partir
> d'elles), §18.3 (`record_decisions` dans la matrice)
> Statut : implémenté, double-vérifié (§6), audité en accessibilité.

## 1. Intégration — ce que ce module doit à l'écosystème et ce qu'il lui rend

### 1.1 Ce que Decision est dans le système

**Un module de connaissance, pas de workflow.** Une Decision n'enregistre pas *ce qui a été fait* — c'est
le rôle de Task — mais **pourquoi ça a été fait ainsi** : le choix, les alternatives écartées, le degré de
confiance. C'est la seule trace qui survit à la question « pourquoi diable avons-nous fait ça ? » six mois
plus tard.

Conséquence majeure sur sa forme : **il n'a pas de machine à états.** Une décision ne transite pas, elle
*a eu lieu*. Ce que d'autres modules modélisent par un cycle de vie, celui-ci le modélise par la
**supersession** : on ne corrige pas une décision, on en enregistre une nouvelle qui remplace l'ancienne,
et les deux restent lisibles.

### 1.2 Modules existants — ce qu'il consomme

| Module | Relation | Conséquence |
| --- | --- | --- |
| **workspace** | toute Decision appartient à un Workspace (§4.17) | FK Cascade, isolation standard |
| **identity** | `author` est un `ActorRef` ; `record_decisions` existe déjà dans la matrice | **y compris pour `READ_ONLY_AGENT`** : « peut lire et commenter » — consigner un raisonnement ne change aucun état, c'est la contribution la plus légitime d'un agent en lecture seule |
| **task** | `taskId` **nullable** (§4.17) | une décision d'architecture au niveau workspace n'est rattachée à aucune tâche ; la lier de force serait un mensonge |

§4.17 ne liste **pas** de `goal_id` — contrairement à Artifact dont le §15.3 liste explicitement Goal. Je
n'en ajoute pas : le contexte de travail passe par la tâche, et inventer un champ que la spec ne demande
pas créerait une relation que personne n'a conçue.

### 1.3 Ce qu'il rend aux modules existants — et une dette d'Artifact à solder

**§15.3 liste `Decision` parmi les huit relations d'un Artifact.** Le module artifact porte aujourd'hui
`goalId`, `taskId`, `repositoryId` — **pas `decisionId`**. C'est une capacité annoncée par la spec et non
fournie, du même type que celles que l'audit transversal a relevées. Elle est soldée ici, maintenant que
l'entité existe : Artifact gagne `decisionId`, vérifié comme les autres liens.

Le sens de la relation est celui du §15.3 : c'est **l'artefact qui référence la décision** (une décision
exportée en document, un diagramme qui l'illustre), jamais l'inverse. Decision n'importe donc pas
artifact.

### 1.4 Ce que les modules à venir en attendront

| Module futur | Attente | Conséquence dès maintenant |
| --- | --- | --- |
| **Memory System** (§16.10) | « toute mémoire peut être reconstruite à partir des Artifacts, des **Events**, des **Decisions** » | la reconstruction exige que **rien ne soit réécrit** : d'où l'immuabilité et la supersession plutôt que l'édition |
| **Memory System** (§16.3) | « Workspace Memory : … décisions … » | une liste par workspace, filtrable, sans exiger de tâche |
| **Audit** (§18.7) | l'auteur et l'instant de chaque choix | `author` + `decidedAt`, immuables |
| **Collaboration** (§10) | un agent consigne ses arbitrages en cours de travail | l'écriture doit être ouverte aux agents, pas réservée aux humains |
| **Validation** (§11) | une revue peut s'appuyer sur le raisonnement consigné | lecture par tâche |

### 1.5 Décisions que cette analyse impose

1. **Immuabilité totale, supersession explicite.** Puisque §16.10 reconstruit la mémoire à partir des
   décisions, permettre l'édition corromprait la reconstruction : on lirait le raisonnement d'aujourd'hui
   en croyant lire celui d'hier. Une décision se remplace, ne se modifie pas.
2. **Pas de machine à états.** Rien ne transite ; la seule évolution est « remplacée par ».
3. **`confidence` est une échelle grossière** (`LOW | MEDIUM | HIGH`), pas un pourcentage. Personne ne
   distingue honnêtement 62 % de 67 % de confiance dans un choix de conception ; une fausse précision
   inviterait à filtrer sur du bruit.
4. **`alternatives` est structuré**, pas une chaîne libre : chaque option écartée porte son motif de rejet.
   C'est précisément ce que la mémoire doit pouvoir relire.
5. **`taskId` nullable** — voir §1.2.

## 2. Modèle de domaine

### 2.1 `Decision` (AggregateRoot, immuable)

**Props** : `workspaceId`, `taskId` (nullable), `subject`, `rationale`, `alternatives`, `outcome`,
`confidence`, `author` (ActorRef), `supersededByDecisionId` (nullable), `decidedAt`.

`subject` n'est pas dans la liste §4.17 mais y est indispensable : sans intitulé, une décision est
introuvable dans une liste. `rationale` est le *pourquoi*, `outcome` le *quoi*.

**`ConsideredAlternative`** (value object) : `option`, `rejectedBecause`.

**Comportements** — un seul, et c'est significatif : `supersede(byDecisionId, now)`. Idempotent si la
décision est déjà remplacée par la même ; refusé si elle l'est déjà par une autre (on ne réécrit pas une
chaîne de supersession) ; refusé si elle se remplacerait elle-même.

**Événements** : `decision.recorded`, `decision.superseded`.

## 3. Couche application

- `RecordDecisionUseCase` — workspace ACTIVE, tâche vérifiée si fournie (même workspace), auteur = acteur
  courant.
- `GetDecisionUseCase` / `ListDecisionsUseCase` — filtres `taskId`, `author`, `confidence`, actives
  seulement ou remplacées comprises. Par défaut les décisions remplacées sont **masquées** : on veut l'état
  courant du raisonnement, l'historique se demande explicitement.
- `SupersedeDecisionUseCase` — enregistre la nouvelle décision **puis** marque l'ancienne, en un seul
  geste : deux appels séparés laisseraient une fenêtre où aucune décision n'est courante.

## 4. Infrastructure

Modèle Prisma `Decision` : FK workspace (Cascade), FK task (SetNull — supprimer une tâche ne doit pas
effacer le raisonnement qui l'a produite), `alternatives` en Json, enum `DecisionConfidence`,
auto-relation `supersededBy`. Index `[workspaceId]`, `[taskId]`.

**Aucune colonne `updatedAt`** : c'est le schéma lui-même qui dit que rien ne change.

## 5. Interface

Sous `/workspaces/:workspaceId/decisions`, toutes en `record_decisions` sauf la lecture
(`read_workspace_state`) — y compris `POST /:decisionId/supersede`, puisque remplacer une décision est
encore consigner un raisonnement.

## 6. Double vérification de complétude

Relecture faite contre la spec entière après le premier vert. L'analyse d'intégration a produit la
décision structurante du module — **l'immuabilité avec supersession** — et elle ne vient pas du §4.17 (qui
ne dit rien du cycle de vie) mais du §16.10 : puisque la mémoire se reconstruit à partir des décisions,
permettre l'édition ferait lire le raisonnement d'aujourd'hui en croyant lire celui d'hier. Sans regarder
le module à venir, j'aurais écrit un `PATCH` banal.

**Dette d'un autre module soldée au passage.** §15.3 liste `Decision` parmi les huit relations d'un
Artifact ; le module artifact portait `goalId`, `taskId`, `repositoryId` et **pas** `decisionId` — une
capacité annoncée par la spec et non fournie, du type exact relevé par l'audit transversal. Ajoutée ici
maintenant que l'entité existe, et vérifiée comme les autres liens (une décision fantôme est refusée, pas
remontée en 500). Le e2e le prouve de bout en bout : un ADR rattaché à la décision qui l'a produit.

**Un piège évité par les tests.** Le lien a d'abord été propagé au seul agrégat ; les tests unitaires
passaient, et l'e2e a renvoyé 400 — le DTO, l'entrée du use-case, la validation de cible et la vue
n'avaient rien reçu. La propagation d'un champ à travers quatre couches n'est jamais acquise parce que le
domaine compile.

Éléments vérifiés conformes : les huit champs §4.17 (plus `subject`, indispensable pour qu'une décision
soit retrouvable, et `decidedAt`) ; `taskId` nullable ; `record_decisions` accordée à `READ_ONLY_AGENT`
respectée par la route — consigner un raisonnement ne change aucun état, c'est la contribution la plus
légitime d'un agent en lecture seule, et l'e2e le vérifie avec un vrai jeton ; aucune colonne `updatedAt`
en base, le schéma dit lui-même que rien ne change ; §5.19 respecté.

**Audit d'accessibilité** : les quatre use-cases ont une route. `record_decisions`, jusque-là déclarée
dans la matrice et utilisée nulle part, en a désormais deux.

Reports explicites :

- **Pas de `goalId`** : §4.17 ne le liste pas, contrairement à §15.3 pour Artifact. Inventer le champ
  créerait une relation que personne n'a conçue ; le contexte de travail passe par la tâche.
- **Chaîne de supersession non parcourue** : on sait qu'une décision est remplacée et par qui, mais aucune
  route ne remonte la chaîne complète. Le Memory System (§16) est le bon endroit pour cette lecture, avec
  les Events et les Artifacts.
