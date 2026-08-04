# Lock — Conception détaillée

> Module : `apps/hub/src/modules/lock/`
> Référence spec : `v3/spline-v3.md` — §4.16 (ResourceLock), §13 (Lock Manager), §13.7 (deux chemins),
> §17.7 (péremption), §17.9 (alerte Lease Expired), §12 (la politique décide du conflit), §18.7 (audit)
> Statut : implémenté, double-vérifié (§4), audité en accessibilité et en isolation.

## 1. Intégration — ce que ce module doit à l'écosystème et ce qu'il lui rend

*C'est la plus vieille promesse non tenue du code : `acquire_locks` est dans la matrice de permissions
depuis le module identity, sans que rien ne soit verrouillable.*

### 1.1 Ce que Lock est dans le système

**L'exclusion mutuelle sur une ressource précise.** §4.16 le cadre par la négative avant tout : « protège
une ressource précise. **Jamais une tâche complète.** » Un lock sur « la tâche 42 » serait un verrou
d'assignation, or l'assignation existe déjà et §4.6 la rend exclusive. Le lock protège ce que deux acteurs
peuvent vouloir toucher en même temps : un fichier, un port, un processus, une branche.

C'est le quatrième mécanisme de contrainte, et il faut le situer face aux trois autres :

| Mécanisme | Empêche |
| --- | --- |
| **Permissions** | qu'un acteur n'ayant pas le droit agisse |
| **Machines à états** | qu'une action arrive au mauvais moment |
| **Policy** | qu'un travail ignore les règles du workspace |
| **Lock** | que **deux acteurs autorisés** se marchent dessus |

Les trois premiers regardent un acteur seul. Le lock est le seul qui parle de concurrence.

### 1.2 Ce que la spec exige nommément et qu'il serait facile de rater

§13.7 et §4.16 consacrent tous deux un paragraphe entier à la même mise en garde, ce qui n'arrive nulle
part ailleurs dans la spec :

> Ré-acquérir un lock qu'on détient déjà (même acteur) est **idempotent** ; acquérir un lock détenu par un
> **acteur différent** est un **conflit réel**. Ce sont deux chemins de code distincts. Un test qui vérifie
> le conflit en utilisant le même acteur des deux côtés ne teste que la réacquisition — **ce précédent est
> arrivé** et a laissé le vrai scénario non couvert (0.3.5).

Ce n'est pas une recommandation de style : c'est un bug vécu, qui a survécu à sa propre suite de tests.
La suite de ce module exerce donc les deux chemins **séparément, avec deux acteurs distincts**, et le
test du conflit le dit dans son nom.

### 1.3 Ce qu'il attend des modules existants

| Module | Ce qu'il lui demande | Forme |
| --- | --- | --- |
| **kernel** | l'arithmétique de péremption | `staleness.isExpired` (§17.7) — écrit pour ce module dès la fondation, jamais utilisé jusqu'ici |
| **identity** | qui détient, et qui a le droit d'acquérir | `ActorRef` + la permission `acquire_locks`, enfin employée |
| **workspace** | l'existence, et la portée | contrôle avant écriture |
| **policy** | §13.4 : le conflit se résout « selon la politique » | une règle `max_lock_ttl` borne la durée qu'un acteur peut s'octroyer — deuxième consommateur réel du moteur de politiques |
| **event** | publier acquisition, libération, péremption | via le bus |

### 1.4 Ce qu'il rend, dès maintenant

**À Notification, sa quatrième alerte câblée** : « Lease Expired » figure explicitement au §17.9. Le
destinataire est déterminé sans politique — celui qui détenait le lock apprend qu'il ne le détient plus,
ce qui est exactement ce qu'il ne peut pas deviner tout seul.

**À la matrice de permissions**, la fin d'une promesse en l'air.

### 1.5 Ce que les modules à venir en attendront

| Module futur | Attente | Conséquence dès maintenant |
| --- | --- | --- |
| **Worker / Runtime** (§6, §7) | « pas de démarrage de processus sans lock détenu » | `resourceType`/`resourceId` reste **opaque** : aucune clé étrangère vers process/task/branch, sinon le module devient dépendant de tout ce qu'il protège |
| **Repository Engine** (§8) | verrous de branche et de worktree | idem — un type de plus, aucun code de plus |
| **Scheduling Engine** (§9) | §13.4 `Waiting`, et §13.6 « notifie le Scheduler » | **dette nommée** : une file d'attente sans répartiteur ne serait jamais servie (§1.7) |

### 1.6 Décisions de conception

**La péremption est calculée à la lecture, pas balayée par un cron.** §13.5 : « automatique, jamais
permanente ». Un lock dont le bail a expiré **ne bloque plus**, immédiatement, sans qu'aucune tâche de
fond n'ait eu à passer. C'est ce pour quoi `staleness.ts` a été écrit au kernel (§17.7). Le nettoyage
effectif a lieu **au moment où il gêne** — c'est-à-dire lors d'une acquisition sur la même ressource.
§13.6 appelle ça « recovery après un crash » ; ici la reprise n'a rien à faire parce qu'un bail expiré
n'a jamais eu d'autorité.

**L'exclusion est garantie par la base, pas par une lecture suivie d'une écriture.** « Les Locks sont
distribués » (§13) : deux acquisitions simultanées sur deux connexions ne peuvent pas être départagées par
un `SELECT` puis un `INSERT`. Le modèle porte donc une colonne `activeKey` — `type:id` tant que le lock est
tenu, **`NULL` dès qu'il est libéré ou périmé** — sous contrainte d'unicité. Postgres considère les `NULL`
comme distincts, donc l'unicité ne s'applique qu'aux locks actifs : l'exclusion est vraie même en
concurrence, **et l'historique est conservé** (§18.7 interdit d'effacer sans audit).

**Un lock libéré n'est pas supprimé.** Même raison qu'une politique désactivée ou qu'une validation
invalidée : ce qui a gouverné le passé doit rester lisible.

**Libérer exige d'être le détenteur.** Avec une dérogation pour `manage_workspace` : un opérateur doit
pouvoir débloquer un workspace dont un acteur est parti sans rendre son verrou. C'est la première
autorisation du code qui dépend de **l'identité de l'acteur** et pas seulement de son rôle — dit ici
parce que c'est un précédent.

### 1.7 La limite qui reste, nommée

§13.4 donne trois issues à un conflit : `Granted`, `Waiting`, `Rejected`. Deux sont implémentées.
**`Waiting` ne l'est pas**, et ce n'est pas un oubli : une file d'attente suppose quelqu'un qui la serve
à la libération — le Scheduler (§9), qui n'existe pas. Enregistrer un « en attente » que rien ne
servirait serait une promesse qu'aucun code ne tient.

Le refus dit donc **qui détient et jusqu'à quand** (§17.8), ce qui rend l'attente possible côté appelant
sans mentir sur ce que le serveur fait.

## 2. Modèle de domaine

### 2.1 `ResourceLock` (AggregateRoot)

**Props** (§4.16) : `workspaceId`, `resourceType`, `resourceId`, `owner` (ActorRef), `reason`,
`status` (`HELD` | `RELEASED` | `EXPIRED`), `acquiredAt`, `expiresAt`, `releasedAt?`.

`lease` du §4.16 est `expiresAt` : un bail est une échéance, et lui donner une entité séparée sans rien
d'autre à porter que sa fin serait une indirection vide.

**Types de ressource** (§13.1, §4.16) : chaîne libre validée — la liste s'allongera avec le Runtime et le
Repository Engine, comme le type d'une Validation.

## 3. Use-cases

| Use-case | Rôle |
| --- | --- |
| `AcquireLock` | §13.2/§13.7 — **deux chemins** : réacquisition idempotente, ou conflit |
| `RenewLock` | §13.2 — repousser l'échéance, réservé au détenteur |
| `ReleaseLock` | §13.2 — détenteur, ou dérogation opérateur |
| `ListLocks` | ce qui est tenu dans ce workspace, péremption calculée |

## 4. Double vérification de complétude

**Les deux chemins du §13.7 sont exercés séparément, avec deux acteurs distincts, et les tests le disent
dans leur nom** — c'est la seule exigence que la spec formule deux fois (§13.7 et §4.16), parce qu'elle
décrit un bug qui a survécu à sa propre suite de tests (0.3.5). Les acteurs s'appellent `a-holder` et
`a-challenger` précisément pour qu'aucune modification future ne puisse les confondre par inadvertance.

**Ce que la conception avait bien anticipé.** La péremption calculée à la lecture rend le §13.6
(« recovery après un crash ») sans objet sur le chemin nominal : un bail expiré n'a jamais eu d'autorité,
donc il n'y a rien à réparer au redémarrage. Le test le vérifie sans aucune tâche de fond — le challenger
obtient simplement la ressource.

**L'exclusion est arbitrée par la base, pas par une lecture.** `activeKey` vaut `type:id` tant que le lock
est tenu et `NULL` sinon, sous contrainte d'unicité : Postgres traitant les `NULL` comme distincts,
l'unicité ne porte que sur les locks vivants. Deux acquisitions concurrentes sur deux connexions ne
peuvent donc pas gagner toutes les deux, **et l'historique est conservé**. Le `P2002` est traduit en
conflit métier plutôt que laissé remonter en 500 — sans quoi une course produirait une erreur serveur là
où la spec attend un refus.

**Une nuance d'autorisation qui aurait pu passer inaperçue.** Un opérateur peut forcer une **libération**,
jamais un **renouvellement** : prolonger le verrou d'un acteur parti reviendrait à garder la ressource
bloquée en son nom. Le test le vérifie dans les deux sens. C'est aussi la première autorisation du code
qui dépend de l'identité de l'acteur et pas seulement de son rôle, et la dérogation est accordée par le
contrôleur depuis une permission réellement détenue — jamais lue dans le corps de la requête.

Éléments vérifiés conformes : §4.16 (ressource précise, `reason` obligatoire, opacité du couple
type/identifiant) ; §13 (durée de vie toujours présente, TTL nul ou négatif refusé) ; §13.2 (Acquire →
Granted/Rejected, Renew, Release) ; §13.5 (péremption calculée, jamais permanente) ; §13.7 (les deux
chemins) ; §12.1 (`max_lock_ttl_ms` borne la durée — deuxième consommateur réel du moteur de politiques,
avec bornage plutôt que refus et durée accordée visible dans la réponse) ; §17.9 (alerte « Lease
Expired » adressée au détenteur) ; §4.2 (workspace obligatoire ; la même ressource dans deux workspaces
est deux ressources) ; §18.7 (aucune suppression).

**Audit d'accessibilité** : les trois use-cases ont une route. `RENEW` et `RELEASE` partagent une route
avec l'action en charge utile : même recherche, même contrôle de propriété, même publication.

Reports explicites, avec leur raison :

- **`Waiting` (§13.4)** n'est pas implémenté, et ce n'est pas un oubli : une file d'attente suppose
  quelqu'un qui la serve à la libération — le Scheduler (§9). Enregistrer un « en attente » que rien ne
  servirait serait une promesse qu'aucun code ne tient. Le refus dit qui détient et jusqu'à quand, ce qui
  rend l'attente possible côté appelant sans mentir sur ce que fait le serveur.
- **« Notifie le Scheduler » (§13.6)** : il n'y a pas de Scheduler. Le fait est publié au journal, prêt
  pour lui.
- **Aucun consommateur ne dépend encore d'un lock.** §10.6 (« sans autorisation : aucune action ») et
  l'interdiction de démarrer un processus sans verrou appartiennent au Runtime, qui n'existe pas. Le
  module fournit le verrou ; personne ne l'exige encore.
