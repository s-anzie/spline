# Validation — Conception détaillée

> Module : `apps/hub/src/modules/validation/`
> Référence spec : `v3/spline-v3.md` — §4.9 (Validation), §11 (Validation Engine), §10.9 (l'agent demande,
> ne décide pas), §4.24 (invariants), §11.7 (conditions de réussite), §11.8 (revalidation),
> §11.9 (graphe), §11.10 (rapports = Artifacts), §17.9 (alerte Validation Failed)
> Statut : implémenté, double-vérifié (§6), audité en accessibilité et en isolation.

## 1. Intégration — ce que ce module doit à l'écosystème et ce qu'il lui rend

*Ce module ferme une dette nommée depuis Task, et c'est le premier à en fermer une plutôt qu'à en créer.*

### 1.1 Ce que Validation est dans le système

**La preuve.** §4.9 : « une tâche n'est jamais terminée sans preuve ». §10.9 : « l'agent demande
Validation. Il ne décide jamais lui-même que son travail est terminé. » C'est la contrepartie du pouvoir
donné aux agents : ils exécutent, ils ne s'auto-attribuent pas la réussite.

À distinguer de trois voisins déjà construits, sous peine de tout confondre :

| | ce que c'est | ce que ce n'est pas |
| --- | --- | --- |
| **Event** | un fait accompli | pas un jugement |
| **Decision** | pourquoi on a fait quelque chose | pas une preuve que c'est fait |
| **Artifact** | ce qui a été produit | pas le verdict sur ce produit |
| **Validation** | le verdict, avec sa preuve | pas la production |

§11.10 les relie : un rapport de validation **est un Artifact**. Le verdict vit ici, la pièce jointe vit
là-bas. C'est pour cela qu'aucun champ « rapport » textuel n'est ajouté : ce serait un Artifact
déguisé.

### 1.2 La dette qu'il ferme, précisément

`task/doc.md` §0.4 le dit sans détour : « `/submit` ne crée aucune Validation. La route porte
`request_validation` et fait passer la tâche en VALIDATING, mais rien n'enregistre ce qu'il y a à revoir.
Le statut est là, la trace n'y est pas. »

Deux choses en découlent, et la seconde est la plus importante :

1. `/submit` crée désormais les Validations demandées.
2. **`complete()` cesse d'être déclaratif.** Aujourd'hui `Task.complete()` ne vérifie que la transition
   VALIDATING → COMPLETED. La machine à états empêche de sauter VALIDATING, ce qui garantit qu'on est
   *passé par* une étape nommée « validation » — pas qu'une preuve existe. §11.7 exige que **toutes les
   validations obligatoires réussissent**. Sans ce contrôle, `CompletionRequiresValidationError`
   protège un mot, pas un fait.

**Inversion de dépendance, comme pour `GoalWorkloadPort`** : la règle « pas de complétion sans preuve »
appartient à Task (elle est dans son agrégat, §4.24), donc **Task déclare le port** et Validation fournit
l'adaptateur. Rien dans `task/` n'importe `validation/`.

### 1.3 Ce qu'il attend des modules existants

| Module | Ce qu'il lui demande | Forme |
| --- | --- | --- |
| **task** | que la tâche existe, dans ce workspace | dépôt de tâches, comme decision et artifact le font déjà |
| **workspace** | que le workspace existe | contrôle avant écriture (sinon 500 sur la FK) |
| **artifact** | héberger les rapports (§11.10) | la Validation référence des artefacts ; elle n'en stocke pas le contenu |
| **event** | publier `validation.requested/succeeded/failed` | via le bus, comme tout le monde |
| **identity** | qui a exécuté la validation (`executed_by`, §4.9) | `ActorRef` |

### 1.4 Ce qu'il rend aux modules existants, dès maintenant

**À Task** : le contrôle réel de complétion (§1.2), et la fin de la dette.

**À Notification** : le **deuxième écouteur câblé**, et cette fois il figure explicitement dans la liste
des alertes du §17.9 — « Validation Failed ». Son destinataire est déterminé sans politique : celui qui a
demandé la validation, et l'assigné de la tâche. C'est le cas que le module Notification avait laissé en
attente faute de producteur ; le producteur existe maintenant.

**À Event** : des faits de gravité `ERROR` qui ont enfin un consommateur (`severityFor` classe déjà
`*_failed` en ERROR — la table avait été écrite pour ce moment).

### 1.5 Ce que les modules à venir en attendront

| Module futur | Attente | Conséquence dès maintenant |
| --- | --- | --- |
| **Policy Engine** (§12) | `policy_check` est un type de validation, et §11.7 exige « aucune politique violée » | le type est une **chaîne libre validée**, pas un enum fermé — §11.2 dit « liste ouverte », publiable par l'Extension Registry (§19) |
| **Worker / Runtime** (§6, §7) | exécuter les validations automatiques et rapporter | `executedBy` est un ActorRef quelconque : un WORKER rapporte comme un HUMAIN approuve |
| **Repository Engine** (§8) | §11.8 : un nouveau commit invalide les validations précédentes | la revalidation est **explicite** (`invalidate`), jamais un effet de bord deviné ici |
| **Scheduling Engine** (§9) | ordonner un graphe de validations (§11.9) | `DependencyGraph` du kernel existe déjà ; ce module stocke les dépendances, il n'ordonnance pas |
| **Extension Registry** (§19) | publier de nouveaux types | d'où le type ouvert |

### 1.6 Ce qu'il ne fait pas

- **Il n'exécute rien.** §11.3 décrit un pipeline `Request → Prepare → Execute → Collect → Evaluate →
  Publish → Complete` ; seuls **Request**, **Collect** (enregistrer le verdict) et **Evaluate** (§11.7)
  vivent ici. Prepare et Execute appartiennent au Runtime, qui n'existe pas. Écrire un exécuteur
  aujourd'hui, ce serait inventer le Worker.
- **Il ne décide pas si une validation est obligatoire.** Le demandeur le déclare (`mandatory`). Choisir
  à sa place demanderait une politique (§12), et une valeur par défaut inventée est pire qu'un champ
  explicite.
- **Il n'invalide pas tout seul** (§11.8). Il expose de quoi invalider ; c'est au Repository Engine de
  dire « ce commit change la donne ». Deviner ce qui est « une modification importante » sans lui serait
  une heuristique invérifiable.
- **Il ne stocke pas de rapport.** §11.10 : un rapport est un Artifact.

### 1.7 La limite qui reste, nommée

§11.7 énonce quatre conditions de réussite : validations obligatoires réussies, **aucune politique
violée**, **toutes les approbations existantes**, **tous les blocages levés**.

Ce module en implémente une et demie honnêtement :

- validations obligatoires réussies : **oui**, c'est le cœur ;
- approbations : **oui**, une approbation humaine est une Validation de type `human_review` ;
- politiques : **non**, le Policy Engine n'existe pas (§12) ;
- blocages levés : **déjà tenu ailleurs** — Task refuse de sortir de BLOCKED sans résoudre, et
  `complete()` part de VALIDATING.

Les deux tenues le sont pour de bon ; la manquante est nommée ici et dans le port, pas sous-entendue.

## 2. Modèle de domaine

### 2.1 `Validation` (AggregateRoot)

**Props** (§4.9) : `workspaceId`, `taskId`, `type`, `status`, `mandatory`, `requestedBy`, `executedBy?`,
`output?`, `reportArtifactIds`, `dependsOnValidationIds`, `createdAt`, `startedAt?`, `finishedAt?`,
`invalidatedAt?`.

`workspace_id` n'est pas dans §4.9 — il y est ajouté pour la même raison qu'il a été ajouté à Event :
sans lui, aucune requête n'est filtrable par workspace, et §4.2 ne souffre aucune exception.

**Statuts** (§11.6) : `PENDING → RUNNING → SUCCEEDED | FAILED`, plus `CANCELLED` et `SKIPPED`.

Une validation invalidée (§11.8) **ne revient pas** à PENDING : elle est marquée invalidée et une
nouvelle est demandée. Réutiliser la ligne effacerait l'historique, alors que §11.1 exige « historisée ».

## 3. Ports

- `VALIDATION_REPOSITORY` — persistance, listes filtrées par workspace/tâche/statut.
- `TASK_PROOF` (déclaré dans **task**) — `hasSatisfiedMandatoryValidations(taskId)`, fourni ici.

## 4. Use-cases

| Use-case | Rôle |
| --- | --- |
| `RequestValidation` | §11.4 — créer la demande (une ou plusieurs) |
| `StartValidation` | PENDING → RUNNING |
| `RecordValidationResult` | §11.5 — verdict, sortie, rapports |
| `SkipValidation` / `CancelValidation` | §11.6 |
| `InvalidateValidations` | §11.8, explicite |
| `ListValidations` / `GetValidation` | lecture |

## 5. Routes

`/workspaces/:workspaceId/tasks/:taskId/validations` et
`/workspaces/:workspaceId/validations/:validationId/...`

## 6. Double vérification de complétude

**La dette est fermée, et pas seulement sur le papier.** L'e2e refait le parcours entier : soumettre
demande les preuves nommées, `complete` est refusé en **409** tant qu'elles manquent — en disant
*lesquelles* (§17.8) — un agent ne peut pas se prononcer sur son propre travail (403, §10.9), et la
complétion passe une fois les verdicts rendus.

**Ce que l'analyse avait bien vu.** §1.2 annonçait que le vrai sujet n'était pas `/submit` mais
`complete()` : la machine à états garantissait qu'on était *passé par* VALIDATING, pas qu'une preuve
existait. `CompletionRequiresValidationError` protégeait un mot. C'est désormais `MissingProofError`,
adossé à des lignes réelles.

**Un détail qui aurait pu passer pour un défaut.** `satisfies()` compte `SKIPPED` comme satisfait. Ce
n'est pas une indulgence : sauter une validation obligatoire est une **exemption délibérée, enregistrée
avec sa raison**, et la laisser bloquer rendrait l'acte sans objet. Le refus reste sur `PENDING`,
`RUNNING`, `FAILED` et sur tout ce qui est invalidé.

**Deux permissions distinctes, et c'est structurel.** `request_validation` pour demander,
`approve_validation` pour prononcer. La matrice garantit déjà qu'aucun rôle d'agent ne détient le second.
Si une seule permission couvrait les deux, §10.9 serait rendu au demandeur.

Éléments vérifiés conformes : §4.9 (champs, `executed_by`, preuve par tâche) ; §11.2 (type **ouvert** —
un enum ferait du registre d'extensions (§19) un changement cassant) ; §11.6 (les six statuts) ; §11.7
(voir §1.7 pour ce qui est tenu et ce qui ne l'est pas) ; §11.8 (invalidation **explicite**, sans retour
à PENDING : §11.1 exige l'historique) ; §11.10 (les rapports sont des Artifacts référencés, jamais du
texte stocké ici) ; §4.2 et §20.4 (workspace obligatoire, testé y compris sur la tentative de verdict via
l'URL d'un autre workspace) ; §20.6 (`allowedStatusTargets` et `satisfies` exposés avant l'échec).

**Ce que ce module rend à Notification** : le **deuxième écouteur câblé**, et le premier des huit alertes
du §17.9 dont le producteur existe enfin — « Validation Failed », adressé à qui a demandé la preuve.
Le destinataire est déterminé par le fait lui-même, sans politique.

**Audit d'accessibilité** : les quatre use-cases ont une route. `StartValidation`, `Skip` et `Cancel` ne
sont pas trois use-cases séparés mais une action passée en charge utile à `/settle` : même recherche,
même contrôle d'isolation, même publication — trois classes n'auraient ajouté que des noms.

Reports explicites, avec leur raison :

- **L'exécution des validations** (§11.3, étapes Prepare/Execute) : c'est le Runtime (§6, §7). Écrire un
  exécuteur ici reviendrait à inventer le Worker.
- ~~**« Aucune politique violée »** (§11.7)~~ : **fermé** par le module policy. Et pas par un second
  chemin de refus : une politique `required_validations` (§12.3) fait naître des Validations obligatoires
  ordinaires, que `CompleteTaskUseCase` exige déjà sans rien savoir des politiques. La quatrième condition
  se ramène à la première.
- **L'ordonnancement du graphe** (§11.9) : `dependsOnValidationIds` est stocké, le `DependencyGraph` du
  kernel existe, mais ordonnancer est au Scheduler (§9).
- **La revalidation automatique** (§11.8) : le déclencheur appartient à qui observe le changement — un
  commit pour le Repository Engine (§8). Deviner ce qu'est « une modification importante » serait une
  heuristique invérifiable.
