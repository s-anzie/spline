# Module `execution` — Run et Attempt (§4.7-4.8, §9.12-9.13)

## 1. Ce que ce module existe pour rendre possible

Une seule question : **« pourquoi cette tâche échoue-t-elle sans arrêt ? »** — et qu'elle ait une réponse.

Avant, une tâche qui échouait trois fois laissait une tâche `FAILED` et rien d'autre. Aucune trace de ce
qui avait tourné, sur quel provider, pour combien, ni de ce qui distinguait la troisième tentative de la
première. §9.12 le dit en une phrase — « L'historique est conservé » — et l'historique n'existait pas.

## 2. Analyse d'intégration (faite avant d'écrire)

**Pourquoi un module à part.** Ni `task` (un Run référence un worker et un provider, que le module task
n'a aucune raison de connaître) ni `runtime` (un Run appartient au cycle de vie d'une tâche, pas d'une
machine). Comme partout ici, les références croisées restent **opaques** — précédent `Task.assigneeId`,
`ResourceLock.resourceId` — donc le couplage est nul : `taskId`, `workspaceId` et `workerId` sont des
chaînes, et aucun import ne traverse.

**Pourquoi Attempt est une entité, pas un agrégat.** §4.8 lui donne un id et des champs, ce qui n'en fait
pas un agrégat. Une Attempt n'a **aucune vie hors de son Run** — exactement le raisonnement qui met les
blockers dans Task (§4.22). Elle est donc persistée avec lui (§5.19), en `Json`, et le repository écrit
toujours l'agrégat entier.

**Ce qui existait déjà et qu'il ne fallait pas refaire.** La machine à états de Task dit déjà
`FAILED → ASSIGNED` : le chemin du retry était là, c'est l'historique qui manquait.

## 3. Les décisions qui valent d'être expliquées

### 3.1 `VALIDATING` est obligatoire entre `RUNNING` et `COMPLETED`

§11 est catégorique : « les agents ne déclarent jamais eux-mêmes une réussite ». Un Run qui pourrait aller
directement à `COMPLETED` serait un Run qui déclare son propre succès. La machine à états l'interdit, et
un test le vérifie plutôt qu'un commentaire l'affirme.

### 3.2 Le numéro de tentative est porté, pas dérivé

`attemptNumber` est écrit sur le Run à sa création, à partir du compte des runs existants. Le dériver à la
lecture — « compte les runs de cette tâche » — serait une requête qui peut se contredire elle-même sous
concurrence : deux retries simultanés liraient le même compte et se croiraient tous deux la tentative 2.

### 3.3 L'invariant de reprise est posé *avant*, pas *après*

§4.8 (0.3.11) : une session Claude ne peut pas reprendre un fil Codex. `resumableBy()` est exposé comme
une **question** (`GET /runs/:id/resumable/:provider`), pas seulement comme un refus au moment d'agir.
La raison est dans l'incident d'origine : accepté puis échoué en aval, le problème se manifeste comme un
contexte malformé plusieurs couches plus loin, et le message d'erreur nomme la mauvaise couche. Le refus
nomme **les deux** providers.

### 3.4 Une tentative encore ouverte quand le Run meurt devient `ABANDONED`

Pas `FAILED` : elle n'a pas échoué, personne ne sait ce qu'elle faisait. Et surtout pas laissée ouverte —
une mesure sans issue est comptée comme « encore en cours » pour toujours, ce qui fausse toute
statistique construite dessus.

### 3.5 Ce module ne décide **pas** du sort de la tâche

§9.13 dit « tâche passe en échec ou retry ». Ce module fait échouer le **Run** et publie `run_finished`.
Décider si la tâche échoue ou repart est une politique d'ordonnancement (§9.12), et un module qui la
trancherait déciderait de ce qu'il ne possède pas. Un test e2e le dit noir sur blanc en marchant la tâche
jusqu'à `FAILED` par ses propres routes.

### 3.6 Le balayage des dépassements est explicite, jamais périodique

Comme toute péremption ici (§17.7), « trop long » est jugé **à la lecture**. Le `ttlMs` arrive dans la
requête, donc changer la politique change toutes les réponses immédiatement, et pas seulement les
futures. Le résultat rend **les identifiants**, jamais un compteur (§17.8) : « quatre runs ont expiré »
n'est pas quelque chose sur quoi agir.

## 4. Le piège d'injection, rencontré à nouveau

`RETRYABLE_TASK` est déclaré ici et fourni par le module task, selon la règle d'inversion habituelle. Le
module fournisseur doit **importer** `TaskModule`, pas seulement être exporté par lui : les dépendances de
l'adaptateur (`TASK_REPOSITORY`) se résolvent dans **son propre** module. L'inverse est un échec au
démarrage dont le message nomme le *consommateur*, ce qui envoie chercher au mauvais endroit. C'est déjà
dans le doc du kernel ; c'est ressorti ici.

## 5. Ce qui reste ouvert

- **La préemption** (§9.14) : elle suppose un bail récupérable et une reprise possible. `resumableBy()` en
  est la moitié ; le bail est au module lock.
- **La réaction à `run_finished`** : personne n'écoute encore. C'est volontaire tant que la politique
  d'ordonnancement (§9.12) n'est pas écrite — un écouteur qui retenterait automatiquement déciderait à sa
  place.
- **Le lien avec les sessions** (§4.12) : un Run et une AgentSession décrivent la même exécution vue de
  deux côtés. Les relier demande de savoir laquelle porte l'autre, et rien ne le tranche encore.
