# Policy — Conception détaillée

> Module : `apps/hub/src/modules/policy/`
> Référence spec : `v3/spline-v3.md` — §12 (Policy Engine), §12.2 (hiérarchie), §12.3 (types),
> §12.4-12.5 (évaluation, violations), §11.7 (« aucune politique violée »), §10.18d (résolution ordonnée),
> §17.8 (détail nominatif), §18 (sécurité)
> Statut : implémenté, double-vérifié (§4), audité en accessibilité et en isolation.

## 1. Intégration — ce que ce module doit à l'écosystème et ce qu'il lui rend

### 1.1 Ce que Policy est dans le système

**Les règles du workspace, déclaratives, que les agents ne peuvent pas contourner** (§12). C'est le
troisième mécanisme de contrainte du système, et il faut le distinguer nettement des deux autres, sinon on
finit par les réimplémenter l'un dans l'autre :

| Mécanisme | Question à laquelle il répond | Portée |
| --- | --- | --- |
| **Permissions** (§18, matrice) | *qui* a le droit d'agir | l'acteur, par rôle |
| **Machines à états** (§22.6) | *quand* une action est possible | l'objet, par son état |
| **Policy** (§12) | *sous quelles règles* ce workspace travaille | le contexte, par héritage |

Un exemple les sépare : la matrice dit qu'un OWNER peut compléter une tâche ; la machine dit qu'on ne
complète que depuis VALIDATING ; la politique dit que *dans ce workspace*, un build est obligatoire avant
toute complétion. Aucun des trois ne peut exprimer les deux autres.

### 1.2 Le cœur : une résolution ordonnée, jamais un score

§12.2 donne la hiérarchie :

```text
Organization → Workspace → [Repository, si la Task en utilise un] → Goal → Task
```

« Une politique plus spécifique surcharge une politique plus générale. » C'est **exactement** la forme
que l'étude d'OpenClaw désignait comme la bonne (§10.18d) : une table de précédence lisible et rejouable,
pas une heuristique pondérée dont personne ne peut prédire la sortie. La résolution se lit donc du plus
spécifique au plus général, et **la première définition trouvée gagne** :

```text
TASK → GOAL → [REPOSITORY] → WORKSPACE → ORGANIZATION
```

Deux conséquences que la spec nomme explicitement et qu'il faut coder telles quelles :

- **L'étape Repository est conditionnelle.** Quand une Task n'a pas de `repository_id`, l'héritage saute
  de Workspace à Goal. §12.2 insiste : « ce n'est jamais un état d'erreur, c'est le cas normal pour tout
  travail hors du domaine logiciel ». C'est la vision produit (§1) qui redescend jusque dans l'algorithme
  de résolution — le logiciel est un cas d'usage, pas une condition.
- **La résolution se fait par règle, pas par bloc.** Un workspace qui fixe `max_cost` et une tâche qui
  fixe `timeout` donnent les deux : surcharger une règle n'efface pas les autres. Résoudre par bloc
  ferait qu'une politique de tâche masque silencieusement toutes celles du workspace.

### 1.3 Ce qu'il attend des modules existants

| Module | Ce qu'il lui demande | Forme |
| --- | --- | --- |
| **workspace** | que le workspace existe ; c'est aussi le niveau d'héritage principal | dépôt, contrôle avant écriture |
| **goal**, **task** | les deux niveaux les plus spécifiques de la hiérarchie | les identifiants suffisent ; la résolution ne charge pas les agrégats |
| **identity** | qui a posé la règle, et qui a le droit d'en poser | `ActorRef` + permission `manage_workspace` — les politiques **sont** les règles du workspace, inventer une permission de plus ne dirait rien de neuf |
| **event** | publier la violation (§12.5) | via le bus |

### 1.4 Ce qu'il rend aux modules existants, dès maintenant

**À Validation et à Task, la quatrième condition du §11.7.** `validation/doc.md` §1.7 nommait le manque :
« aucune politique violée : **non**, le Policy Engine n'existe pas ». Il existe.

Mais la façon dont ce manque se ferme mérite d'être dite, parce qu'elle est meilleure qu'un second
contrôle : §12.3 prévoit un type **Validation** (« build obligatoire, couverture minimale, sécurité
obligatoire »). Une politique `required_validations` fait donc que la soumission crée ces preuves
**même si l'agent ne les a pas demandées**. Elles deviennent alors des validations obligatoires
ordinaires, et le contrôle de complétion déjà écrit (`TaskProofPort`) les exige sans rien savoir des
politiques.

Autrement dit : la quatrième condition du §11.7 n'a pas besoin d'un contrôle parallèle, elle se ramène à
la première. Un second chemin de refus aurait été deux endroits à garder cohérents.

**À Notification, sa troisième alerte câblée** : §12.5 exige qu'une violation génère « un Event, une
entrée Audit, **et une Notification** ». Le destinataire est déterminé sans politique — celui qui a tenté
l'action apprend pourquoi elle est refusée.

### 1.5 Ce que les modules à venir en attendront

| Module futur | Attente | Conséquence dès maintenant |
| --- | --- | --- |
| **Worker / Agent Runtime** (§6, §7) | types Security et Runtime : accès réseau, secrets, timeout, mémoire | le stockage et la résolution sont génériques ; les valeurs sont du `Json` que le Runtime interprétera |
| **Repository Engine** (§8) | type Git, et **l'étape conditionnelle** de la hiérarchie | `REPOSITORY` est déjà un niveau de portée, sauté tant qu'aucune tâche n'a de dépôt |
| **Extension Registry** (§19) | type Extension : quelles extensions, signature obligatoire, source de confiance | idem |
| **Audit** (§4.23, §18.7) | l'entrée d'audit qu'exige §12.5 | **dette nommée** : l'Event et la Notification sont produits, l'AuditEntry n'existe pas encore |
| **AgentSession** (§4.12) | « peut suspendre une Session » (§12.5) | **dette nommée** : rien à suspendre aujourd'hui |

### 1.6 Ce qu'il ne fait pas, et pourquoi

- **Il n'interprète pas les valeurs qu'il ne peut pas faire respecter.** §12.3 liste six types ; un seul a
  aujourd'hui un consommateur réel (Validation). Security, Runtime, Git, Cost et Extension sont stockés et
  résolus, **pas évalués** : le Runtime, le Repository Engine et le Registre n'existent pas. Écrire un
  évaluateur de `max_memory` sans rien qui alloue de la mémoire produirait une règle que personne
  n'applique — et une fausse assurance, ce qui est pire que l'absence.
- **Il ne remplace pas la matrice de permissions.** Voir §1.1.
- **Il ne ferme pas la communication entre membres.** L'étude OpenClaw (§10.18c) notait que chez eux
  l'échange entre agents est fermé par défaut. Le moteur peut désormais porter une telle règle — c'est le
  point d'accroche qui manquait. Mais **aucune règle de ce genre n'est écrite ici** : personne n'a demandé
  à restreindre les messages, et une politique sans utilisateur est l'abstraction que ce projet refuse
  ailleurs. Le hameçon existe, l'hameçon suffit.
- **Il n'audite pas.** §12.5 l'exige, §4.23 définit l'entité, elle n'existe pas. Nommé, pas simulé.

### 1.7 Une décision de conception qui pourrait surprendre

**Une politique désactivée n'est pas supprimée.** §18.7 interdit la suppression sans audit, et une règle
qui a gouverné des décisions passées doit rester lisible pour les expliquer. `enabled: false` la retire de
la résolution en gardant la trace — même raisonnement que l'invalidation d'une Validation (§11.8) plutôt
que sa réécriture.

## 2. Modèle de domaine

### 2.1 `Policy` (AggregateRoot)

**Props** : `workspaceId`, `scopeType` (`ORGANIZATION` | `WORKSPACE` | `REPOSITORY` | `GOAL` | `TASK`),
`scopeId`, `type` (§12.3), `rule`, `value` (Json), `enabled`, `createdBy`, `createdAt`, `updatedAt`.

`workspaceId` est présent même pour une portée `ORGANIZATION` : sans lui aucune requête n'est filtrable
par workspace, et §4.2 ne souffre aucune exception. La portée dit d'où la règle vient ; le `workspaceId`
dit où elle est lisible.

`rule` est une chaîne libre validée, comme le `type` d'une Validation : §12.3 énumère des exemples, pas
une liste close, et le Runtime comme le Registre en publieront d'autres.

### 2.2 Résolution — `PolicyResolver` (service de domaine, pur)

Entrée : les politiques applicables + le contexte (`taskId?`, `goalId?`, `repositoryId?`, `workspaceId`,
`organizationId?`). Sortie : la valeur effective de chaque règle **et la politique qui l'a décidée**
(§17.8 — un état ne se rapporte jamais sans dire ce qui l'a produit).

## 3. Use-cases

| Use-case | Rôle |
| --- | --- |
| `SetPolicy` | poser ou remplacer une règle à une portée |
| `DisablePolicy` | la retirer de la résolution sans effacer l'histoire (§1.7) |
| `ListPolicies` | les règles déclarées d'un workspace |
| `ResolveEffectivePolicies` | §12.2 — ce qui s'applique réellement ici, avec l'origine |
| `ReportViolation` | §12.5 — Event + Notification |

## 4. Double vérification de complétude

**Ce que l'analyse avait bien vu, et qui s'est confirmé à l'usage.** §1.4 annonçait que la quatrième
condition du §11.7 se ramènerait à la première plutôt que d'ouvrir un second chemin de refus. C'est ce qui
se passe : une politique `required_validations` fait naître des Validations obligatoires ordinaires, et
`CompleteTaskUseCase` les exige **sans rien savoir des politiques**. Le e2e le prouve — l'agent demande
`unit_test`, le workspace impose `build` et `security_scan`, les trois sont créées, la complétion est
refusée puis acceptée. Deux endroits à garder cohérents ont été évités.

**Deux frictions d'interface, mineures mais instructives.** `value` est volontairement non typé (§12.3
porte des nombres, des chaînes, des listes) — mais `forbidNonWhitelisted` rejette toute propriété sans
validateur : « n'importe quoi » doit être dit à voix haute (`@IsDefined()`). Et `includeDisabled` arrive
d'une requête HTTP en texte : `@Type(() => Boolean)` aurait rendu `"false"` vrai.

**Une prudence délibérée dans l'adaptateur.** Les valeurs viennent de `Json` : `required_validations` est
filtré plutôt que présumé bien formé. Une règle mal écrite ne doit ni imposer silencieusement rien, ni
faire échouer une soumission — elle impose ce qu'on peut lire.

Éléments vérifiés conformes : §12.1 (autorisations, interdictions, limites, obligations — le stockage est
générique, `required_validations` exerce la catégorie « obligations ») ; §12.2 (précédence écrite et
testée niveau par niveau, **saut conditionnel du Repository** testé dans les deux sens, résolution
**règle par règle**) ; §12.3 (six types stockés, `rule` en chaîne libre) ; §12.4-12.5 (Event + Notification
produits ; voir les reports) ; §4.2 (workspace obligatoire, testé y compris sur une tentative de
désactivation via l'URL d'un autre workspace) ; §17.8 (la résolution nomme **ce qui a décidé**, pas
seulement la valeur) ; §18.7 (aucune route de suppression).

**Audit d'accessibilité** : quatre des cinq use-cases ont une route. `ReportViolation` n'en a
délibérément **pas** : §12.5 fait du signalement le devoir de qui détecte la violation, et les détecteurs
sont le Runtime et le Repository Engine. Une route HTTP « déclarez une violation » ouverte aux acteurs
laisserait n'importe qui fabriquer des alertes contre n'importe qui. Le use-case est exporté, appelable
par un module ; il le deviendra depuis un vrai détecteur.

Reports explicites, avec leur raison :

- **Cinq des six types ne sont pas évalués.** Security, Runtime, Git, Cost et Extension sont stockés et
  résolus, jamais appliqués : rien n'alloue de mémoire, ne compte de jetons, ne touche un dépôt ni
  n'installe d'extension. Un évaluateur de `max_memory` sans allocateur produirait une fausse assurance,
  ce qui est pire que l'absence.
- **L'entrée d'Audit du §12.5** : `AuditEntry` (§4.23) n'existe pas.
- **« Peut suspendre une Session »** (§12.5) : il n'y a pas de Session (§4.12).
- **La communication fermée par défaut** (§10.18c) : le moteur peut désormais porter la règle — c'est le
  point d'accroche qui manquait — mais aucune règle de ce genre n'est écrite. Personne n'a demandé à
  restreindre les messages, et une politique sans utilisateur est l'abstraction que ce projet refuse
  ailleurs.
