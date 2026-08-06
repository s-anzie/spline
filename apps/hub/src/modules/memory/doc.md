# Memory — Conception détaillée

> Module : `apps/hub/src/modules/memory/`
> Référence spec : `v3/spline-v3.md` — §16 (Memory System), §16.2 (hiérarchie), §16.9 (indexation),
> §16.10 (reconstruction), §10.3-10.4 (l'agent synchronise puis lit), §12.2 (hiérarchie voisine, à ne pas
> confondre), §4.2 (isolation)
> Statut : implémenté, double-vérifié (§4), audité en accessibilité et en isolation.

## 1. Intégration — ce que ce module doit à l'écosystème et ce qu'il lui rend

### 1.1 La phrase qui décide de tout le module

§16 s'ouvre là-dessus, avant même ses principes :

> **Aucune mémoire ne constitue la source de vérité — celle-ci reste le Domain Model.**

Tout le reste en découle, et c'est la contrainte la plus facile à trahir sans s'en apercevoir. Une
mémoire qui **recopie** une Decision devient une seconde version de cette décision : elle vieillit, elle
diverge, et le jour où les deux se contredisent personne ne sait laquelle croire. §16.3 dit pourtant que
la mémoire de workspace contient « décisions, politiques » — la tentation de dupliquer est écrite dans la
spec elle-même.

**La règle du module est donc :** une entrée de mémoire est soit une **note** (un texte que personne
d'autre ne détient), soit un **renvoi** vers un objet du domaine (`sourceType`/`sourceId`) — jamais une
copie de son contenu. Le test qui compte n'est pas « la mémoire est-elle riche » mais **« peut-on
l'effacer entièrement sans rien perdre »**. §16.10 exige précisément cela : elle se reconstruit à partir
des Artifacts, des Events, des Decisions.

### 1.2 Une hiérarchie qui ressemble à celle de Policy, et se comporte à l'inverse

§16.2 donne :

```text
Organization → Workspace → [Repository] → Goal → Task → Run → Session
```

C'est visuellement la hiérarchie du §12.2, et le réflexe serait de réutiliser la résolution du module
policy. **Ce serait un contresens.**

| | Policy (§12.2) | Memory (§16.2) |
| --- | --- | --- |
| question | *quelle règle s'applique ?* | *que dois-je savoir ?* |
| résultat | **une** valeur par règle | **tout**, cumulé |
| le plus spécifique | **écrase** le général | **s'ajoute** au général |
| ordre de lecture | du spécifique au général, on s'arrête | du général au spécifique, on continue |

Une politique de tâche remplace celle du workspace ; une note de tâche ne remplace pas les conventions du
workspace, elle vient après. Lire la mémoire d'une tâche, c'est donc obtenir le contexte **empilé**, dans
l'ordre où un humain le raconterait : d'abord où l'on est, ensuite ce qu'on y fait.

### 1.3 Ce qu'il attend des modules existants

| Module | Ce qu'il lui demande | Forme |
| --- | --- | --- |
| **workspace** | l'existence, la portée principale | contrôle avant écriture |
| **goal**, **task** | les niveaux spécifiques | identifiants seuls ; la lecture ne charge pas les agrégats |
| **decision**, **artifact** | de quoi se reconstruire (§16.10) | **des renvois**, jamais des copies (§1.1) |
| **identity** | l'auteur (§16.9 indexe par auteur) | `ActorRef` |
| **event** | publier ce qui est mémorisé | via le bus |

### 1.4 Ce que les modules à venir en attendront

| Module futur | Attente | Conséquence dès maintenant |
| --- | --- | --- |
| **Agent Runtime** (§10.3-10.4) | « Synchronize » puis « Read » — la mémoire est ce qu'un agent charge avant d'agir | la lecture cumulée doit être **une seule requête**, ordonnée, bornée |
| **Repository Engine** (§8) | mémoire de dépôt (§16.4), « présent uniquement si le Repository Engine est utilisé » | `REPOSITORY` est un niveau prévu, sauté sinon — comme dans policy |
| **Run / Session** (§4.7, §4.12) | mémoire de run, mémoire de session temporaire | les niveaux existent ; **rien ne termine une session** aujourd'hui (§1.6) |
| **Observability** (§17) | mémoire observable (§16.1) | l'indexation du §16.9 est la surface de requête |

### 1.5 Décisions de conception

**Versionnée par supersession, pas par écrasement** (§16.1 « versionnée »). Corriger une note crée une
nouvelle entrée qui remplace l'ancienne, laquelle reste lisible — exactement le patron de Decision
(§4.17) et de Validation invalidée (§11.8). Une mémoire qui s'écrase perd la raison pour laquelle on
croyait autre chose hier, ce qui est souvent l'information la plus utile.

**Les renvois ne sont pas vérifiés à la lecture.** Un renvoi vers une Decision supprimée reste affiché
comme renvoi mort plutôt que filtré en silence : la mémoire n'est pas la source de vérité, elle n'a pas à
faire semblant d'être à jour. Le lecteur voit qu'il manque quelque chose, ce qui est l'information utile.

**La lecture cumulée est bornée par niveau.** Un agent qui charge son contexte ne doit pas recevoir mille
notes de workspace : chaque niveau est plafonné, et le plafond est dit dans la réponse. Une troncature
silencieuse se lirait comme « il n'y a que ça » (§17.8).

### 1.6 Ce qu'il ne fait pas, et les limites nommées

- **Il ne recopie rien.** Voir §1.1. C'est la règle, et le module n'a aucun champ où loger une copie de
  contenu d'un autre agrégat — seulement un renvoi.
- **Il ne fait pas de recherche sémantique.** §16.1 dit « requêtable » ; l'indexation du §16.9 est par
  type, date, auteur, portée et tags. Un index vectoriel serait une infrastructure entière, sans
  consommateur tant que l'Agent Runtime n'existe pas.
- **Rien ne termine une session.** §16.8 veut une mémoire de session temporaire, qui « disparaît en fin de
  session » : il n'y a pas de session (§4.12). Le niveau existe, l'effacement viendra avec elle. La
  seconde moitié de la phrase — « ne contient jamais d'information critique » — est en revanche tenue
  dès maintenant, précisément parce qu'aucune mémoire n'est source de vérité.
- **La reconstruction (§16.10) est partielle et le dit.** Decisions et Artifacts existent, donc elle les
  retrouve. Repositories non. Les Events sont déjà le journal : les transformer en notes doublerait un
  journal interrogeable, ce que §1.1 interdit.

## 2. Modèle de domaine

### 2.1 `MemoryEntry` (AggregateRoot)

**Props** : `workspaceId`, `scopeType` (`ORGANIZATION` | `WORKSPACE` | `REPOSITORY` | `GOAL` | `TASK` |
`RUN` | `SESSION`), `scopeId`, `type`, `title`, `content` (nullable), `sourceType`/`sourceId`
(nullable — le renvoi), `tags`, `author`, `supersededById` (nullable), `createdAt`.

**Invariant** : une entrée porte **soit** un `content`, **soit** un renvoi — jamais les deux, jamais
aucun des deux. Les deux ensemble, c'est la copie que §1.1 interdit ; aucun des deux, c'est une entrée
vide.

## 3. Use-cases

| Use-case | Rôle |
| --- | --- |
| `RememberEntry` | écrire une note ou poser un renvoi |
| `SupersedeEntry` | corriger sans effacer (§1.5) |
| `ForgetEntry` | retirer une note ; sûr par construction (§1.1) |
| `ReadContext` | §16.2 — le contexte cumulé, du général au spécifique |
| `SearchMemory` | §16.9 — par type, auteur, portée, tags |
| `ReconstructMemory` | §16.10 — repose les renvois depuis le domaine |

## 4. Double vérification de complétude

**La propriété centrale est testée, pas seulement affirmée.** Le e2e efface intégralement la table de
mémoire d'un workspace, relance la reconstruction (§16.10) et retrouve ses renvois. Si effacer était
destructeur, ce test ne pourrait pas exister — c'est la démonstration que la mémoire n'est pas source de
vérité, et non une promesse dans un commentaire.

**Le contresens que l'analyse voulait éviter est testé nommément.** §16.2 et §12.2 se ressemblent à s'y
méprendre ; réutiliser la résolution de policy aurait produit une mémoire où une note de tâche **efface**
les conventions du workspace. Le test « stacks every level instead of letting the most specific win »
existe pour que ce glissement soit rouge s'il est réintroduit.

**L'invariant note-ou-renvoi est refusé aux deux extrémités** : une entrée qui porte à la fois un renvoi
et une copie du contenu visé est rejetée (c'est la seconde version qui vieillit en silence), et une
entrée vide aussi.

Éléments vérifiés conformes : §16 ouverture (aucun champ ne permet de loger une copie ; effacement
prouvé sûr) ; §16.1 (persistante, **versionnée par supersession**, requêtable, indépendante des
providers) ; §16.2 (les sept niveaux, cumul du général au spécifique, saut de ceux qui manquent) ; §16.9
(type, date, auteur, portée, tags) ; §16.10 (reconstruction idempotente, garantie par un index unique
par source) ; §4.2 (workspace obligatoire partout, testé) ; §17.8 (chaque niveau dit s'il a été tronqué
et combien il y avait — une coupe silencieuse se lirait « il n'y a que ça »).

**Une décision qui pourrait passer pour un oubli** : un renvoi vers un objet disparu n'est **pas** filtré
à la lecture. La mémoire n'est pas la source de vérité et n'a pas à faire semblant d'être à jour ; un
renvoi mort visible est une information, un renvoi escamoté n'en est pas une.

**Audit d'accessibilité** : les cinq use-cases ont une route. Écrire est une permission de travail
ordinaire (`read_workspace_state`) — un agent qui note ce qu'il apprend est la raison d'être du module —
tandis que la reconstruction est administrative : elle réécrit la mémoire entière d'un workspace.

Reports explicites, avec leur raison :

- **Recherche sémantique** : §16.1 dit « requêtable » et §16.9 énumère un index par type, date, auteur,
  portée et tags — ce qui est livré. Un index vectoriel serait une infrastructure entière sans
  consommateur tant que l'Agent Runtime (§7) n'existe pas.
- **Effacement de la mémoire de session** (§16.8) : le niveau `SESSION` existe, mais rien ne termine une
  session (§4.12). La seconde moitié de l'exigence — « ne contient jamais d'information critique » — est
  en revanche tenue dès maintenant, et pour tous les niveaux, précisément parce qu'aucune mémoire n'est
  source de vérité.
- ~~**Reconstruction depuis les Repositories**~~ (§16.10) : **fermée** — les dépôts sont désormais une source. Depuis
  les **Events** : délibérément non fait — le journal est déjà interrogeable et le recopier en notes
  dupliquerait une source de vérité, ce que l'ouverture du §16 interdit. Les deux sont nommés dans la
  réponse de l'opération, pas seulement ici.

## La mémoire arrive enfin jusqu'à l'agent

Jusqu'ici ce module était **écrit et jamais lu par ceux qu'il concerne**. Les notes existaient, les
routes répondaient, et un agent dispatché commençait chaque tâche en ne sachant rien : il rejouait la
convention tranchée la semaine dernière, à chaque fois.

`AgentMemoryAdapter` fournit le port `AGENT_MEMORY` que **runtime déclare** (règle d'inversion : le
consommateur déclare, le fournisseur livre). Il rend des **notes plates**, pas des `MemoryEntry` : un
agrégat porte un auteur, une chaîne de supersession et un pointeur de source, dont aucun n'a sa place
dans un prompt — et les passer inviterait le prompt à arbitrer ce qui est l'affaire de ce module.

### Le plafond, et pourquoi il est annoncé

Le constructeur de contexte plafonne déjà chaque portée à 25. Quatre portées peuplées mettraient donc
cent paragraphes devant le modèle, **payés à chaque tentative**. L'adaptateur coupe à 30 au total. Ce
n'est pas un jugement sur les notes qui comptent : elles arrivent du plus général au plus spécifique, la
coupe tombe donc sur le plus précis — et §17.8 impose qu'une coupe se dise. Elle se dit, dans la liste
elle-même.

### Une lecture de contexte qui échoue ne bloque pas un dispatch

Un prompt sans mémoire est moins bon qu'un prompt avec. Il vaut infiniment mieux que pas de prompt du
tout. L'adaptateur rend une liste vide plutôt que de faire échouer l'ordre.

