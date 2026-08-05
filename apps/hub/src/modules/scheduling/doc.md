# Scheduling — Conception détaillée

> Module : `apps/hub/src/modules/scheduling/`
> Référence spec : `v3/spline-v3.md` — §9 (Scheduling Engine), §9.5 (DAG), §9.6 (états), §9.7 (priorités),
> §9.16 (double déclencheur), §10.18d (précédence ordonnée, jamais un score), §17.8 (détail nominatif),
> §22.6 (machines à états)
> Statut : implémenté, double-vérifié (§4), audité en accessibilité et en isolation.

## 1. Intégration — ce que ce module doit à l'écosystème et ce qu'il lui rend

### 1.1 « Où » et « quand » — et un seul des deux est possible aujourd'hui

§9 s'ouvre là-dessus : « il ne réalise jamais le travail : il décide **où** et **quand** ».

**Le « où » est hors de portée.** §9.8 (contraintes : OS, CPU, GPU, mémoire, provider) et §9.9
(capacités : Docker, Go, GPU, Claude, Codex) supposent des Workers, et §9.9 est catégorique — « une tâche
ne peut être assignée qu'à un Worker compatible ». Il n'y a pas de Worker (§6-7). Écrire un allocateur
sans rien à allouer produirait un mécanisme qui assigne toujours à personne.

**Le « quand » est entièrement faisable.** §9.5 : « une tâche devient exécutable lorsque toutes ses
dépendances sont satisfaites ». Les dépendances existent, les priorités existent, le `DependencyGraph`
du kernel a été écrit pour ce chapitre (§9.5) et n'a encore servi à aucun module.

La sortie de ce module est donc **une file, pas une assignation** : ce qui est exécutable, dans quel
ordre, et — pour ce qui ne l'est pas — **pourquoi**. L'assignation attendra ceux à qui assigner.

### 1.2 Une précédence écrite, jamais un score

C'est ici que s'applique la leçon que l'étude d'OpenClaw avait isolée (§10.18d) : une table de précédence
lisible et rejouable, pas une heuristique pondérée dont personne ne peut prédire la sortie.

L'ordre est donc une suite de **paliers comparés l'un après l'autre**, jamais des poids additionnés :

| Palier | Règle | Pourquoi |
| --- | --- | --- |
| 1 | priorité (§9.7) | ce que le workspace a déclaré urgent l'est |
| 2 | nombre de tâches que celle-ci débloque | libérer trois tâches vaut mieux qu'en libérer zéro, et c'est **compté, pas estimé** |
| 3 | la plus ancienne d'abord | une tâche de faible priorité finit par passer, au lieu d'être doublée indéfiniment |
| 4 | identifiant | déterminisme total : deux exécutions donnent le même ordre |

Un score aurait pu classer une tâche `BACKGROUND` devant une `CRITICAL` parce qu'elle débloque beaucoup.
Des paliers ne le peuvent pas : le palier 2 ne départage que des tâches de même priorité.

### 1.3 §9.16 — le second déclencheur, et la moitié qui est implémentable

§9.16 est la troisième leçon d'exploitation de la spec, après §13.7 et §17.8 :

> Sans ce second déclencheur, un système entièrement à jour finit par se taire pour de bon, sans qu'aucun
> signal n'indique à personne qu'un nouveau travail est nécessaire (0.3.10).

Le déclencheur réactif suppose quelqu'un à réveiller — donc un Worker, donc plus tard. **Mais la cause du
problème est ailleurs** : le silence. Un acteur qui demande son travail et reçoit une liste vide
n'apprend rien, et c'est vrai dès aujourd'hui.

La moitié implémentable est donc côté réponse : **une file vide n'est jamais renvoyée vide**. Elle dit
combien de tâches attendent, sur quoi précisément, et ce qui débloquerait la situation — au format que
§17.8 impose partout ailleurs. Le silence devient un signal ; le réveil périodique viendra avec ceux
qu'il faut réveiller.

### 1.4 Les états du §9.6, et pourquoi ce module n'en ajoute aucun

§9.6 donne `WAITING → READY → SCHEDULED → ASSIGNED → RUNNING → VALIDATING → COMPLETED`, plus six états
exceptionnels. La machine de Task en couvre déjà sept ; il manque `WAITING`, `SCHEDULED`, `RETRYING`,
`PAUSED`, `WAITING_APPROVAL`.

**Ce module n'en ajoute aucun**, et c'est délibéré. §22.6 fait de la machine d'un agrégat son autorité :
lui greffer des états dont le sens appartient à un autre module en ferait deux propriétaires du même
champ. `WAITING` et `SCHEDULED` sont d'ailleurs des **vues** — « pas encore exécutable » et « choisie
pour l'être » — que la file exprime sans qu'on écrive quoi que ce soit dans la tâche. `RETRYING` viendra
avec Run/Attempt, `PAUSED` et `WAITING_APPROVAL` avec les sessions.

Le scheduler **lit** l'état des tâches ; il ne le pilote pas.

### 1.5 Ce qu'il attend des modules existants

| Module | Ce qu'il lui demande | Forme |
| --- | --- | --- |
| **kernel** | l'acyclicité et le tri topologique | `DependencyGraph` (§9.5), écrit à la fondation et jamais utilisé jusqu'ici |
| **task** | les tâches, leurs dépendances, leur priorité, leur état | dépôt de tâches |
| **goal** | qu'un objectif inactif ne produise pas de travail | dépôt d'objectifs |
| **workspace** | l'existence, la portée | contrôle avant lecture |

### 1.6 Ce que les modules à venir en attendront

| Module futur | Attente | Conséquence dès maintenant |
| --- | --- | --- |
| **Worker** (§6) | l'assignation, les contraintes (§9.8), les capacités (§9.9) | la file est déjà ordonnée : assigner deviendra « prendre la tête de file compatible » |
| **Run / Attempt** (§4.7-4.8) | §9.12 retry, §9.13 timeout | ce module ne crée rien ; il lira |
| **Lock** | §9.11 réservation | les verrous existent, il n'y a rien à ajouter |
| **Notification** | §9.16, le réveil périodique | l'écouteur naîtra avec ce qu'il réveille |

### 1.7 Ce qu'il ne fait pas, et pourquoi

- **Il n'assigne pas.** §1.1.
- ~~**Il ne préempte pas** (§9.14)~~ — **livré**, voir plus bas. La supposition qui manquait (une tâche en
  cours, avec de quoi dire ce qu'on lui prend) est satisfaite depuis le module `execution`.
- ~~Il ne préempte pas~~ : ce qui suit était vrai avant. Interrompre une tâche moins prioritaire suppose une tâche en cours
  d'exécution réelle et un bail récupérable ; les verrous existent, l'exécution non.
- **Il ne rejoue pas** (§9.12). Un retry crée un Run et une Attempt, qui n'existent pas.
- **Il n'écrit rien.** Ce module est **entièrement en lecture** — un fait rare ici, et une propriété utile :
  interroger l'ordonnancement ne peut rien casser, donc la file peut être consultée aussi souvent qu'on
  veut.

## 2. Modèle de domaine

Pas d'agrégat, pas de table. Une fonction pure — `scheduleOf(tasks, now)` — qui produit :

- `ready` : les tâches exécutables, **ordonnées** selon §1.2 ;
- `waiting` : celles qui ne le sont pas, **chacune avec ce qui la retient** (§17.8) ;
- `cycles` : les dépendances circulaires, si le graphe en contient.

Aucune persistance : l'ordonnancement est une **conclusion**, recalculable à tout instant depuis l'état
des tâches. Le stocker créerait une seconde vérité qui vieillit — la faute que le module memory refuse
par construction.

## 3. Use-cases

| Use-case | Rôle |
| --- | --- |
| `GetSchedule` | §9.5/§9.7 — la file ordonnée d'un workspace, et pourquoi le reste attend |
| `GetNextForActor` | §9.16 — « que dois-je faire ? », et une réponse utile même quand c'est « rien » |

## 4. Double vérification de complétude

**La leçon du §10.18d est testée par sa propriété, pas par sa forme.** Le test qui compte n'est pas
« l'ordre est correct » mais **« une tâche `BACKGROUND` qui débloque vingt autres ne double jamais une
`CRITICAL` »**. C'est précisément ce qu'un score pondéré ne peut pas promettre : il suffit d'un poids mal
choisi. Des paliers comparés l'un après l'autre le garantissent par construction — le palier 2 n'est
atteint que lorsque le palier 1 est à égalité.

**`DependencyGraph` sert enfin.** Écrit au kernel pour §9.5 dès la fondation, il n'avait été utilisé par
aucun module. C'est le troisième cas de ce type après `staleness` (repris par lock) et le port
`EventPublisher` : les primitives exigées nommément par la spec ont attendu leur chapitre, et aucune ne
s'est révélée fausse en l'attendant.

**Un choix qui pourrait passer pour un manque : ce module ne persiste rien.** Un ordonnancement est une
**conclusion** sur un état, pas un état. Le stocker créerait une seconde vérité qui vieillit — exactement
ce que le module memory refuse par construction — et il faudrait ensuite l'invalider à chaque changement
de tâche. Recalculer coûte une requête ; se tromper coûte une file qui recommande une tâche déjà faite.

**Deux conséquences agréables** de cette décision : le module est **entièrement en lecture**, donc
consulter la file ne peut rien casser et peut se faire aussi souvent qu'on veut ; et il n'a **ni table ni
migration**, une première ici.

Éléments vérifiés conformes : §9.5 (le DAG, l'exécutabilité, les cycles nommés au lieu d'être parcourus) ;
§9.7 (les cinq priorités) ; §9.3 (les objectifs comptent parmi les entrées — les tâches d'un objectif
annulé cessent d'être proposées) ; §9.16 (voir ci-dessous) ; §10.18d (précédence ordonnée) ; §17.8 (ce
qui attend, et **sur quoi**) ; §4.6 (la file *montre* une tâche libre, elle ne l'attribue jamais — deux
acteurs ne peuvent pas s'en saisir en même temps) ; §4.2 (isolation testée).

**§9.16, et la moitié qui est réellement faite.** Le déclencheur réactif suppose quelqu'un à réveiller,
donc un Worker. Mais la cause du problème décrit — « un système entièrement à jour finit par se taire pour
de bon » — est le **silence**, et il existe déjà : un acteur qui demandait son travail recevait une liste
vide et n'apprenait rien. Une file vide n'est plus renvoyée nue : elle dit combien de tâches attendent,
sur quoi, combien sont en cours, et **si le workspace n'a réellement plus rien** — ce dernier point étant
la distinction que la liste vide écrasait.

**Audit d'accessibilité** : les deux use-cases ont une route, en `read_workspace_state`. Aucune écriture,
donc aucune permission d'écriture.

Reports explicites, avec leur raison :

- **L'assignation** (§9.1, §9.8-9.10) : §9.9 est catégorique — « une tâche ne peut être assignée qu'à un
  Worker compatible » — et il n'y a pas de Worker. Un allocateur sans rien à allouer assignerait toujours
  à personne. La file est déjà ordonnée ; assigner deviendra « prendre la tête de file compatible ».
- **Le réveil périodique** (§9.16, moitié réactive) : rien à réveiller.
- ~~**La préemption** (§9.14)~~ : **livrée**. La décision est une fonction pure
  (`choosePreemptionVictim`) — une **précédence écrite et rejouable, jamais un score** (§10.18d) :
  éligibilité d'abord (priorité strictement inférieure, reprise possible, bail récupérable), puis ordre
  (moins urgent, puis démarré le plus récemment donc le moins de travail perdu, puis par identifiant).
  Une tâche inéligible ne gagne jamais sur l'ordre. Le refus **nomme chaque tâche examinée et sa raison**
  (§20.6) : « rien à préempter » enverrait inspecter trois tâches sans dire laquelle a échoué sur quoi.

  Trois ports déclarés ici, trois adaptateurs fournis ailleurs : `task` décide qu'interrompre veut dire
  `BLOCKED` et pas `FAILED` (une tâche garde où elle en était, elle **reprend** au lieu de recommencer,
  §4.6) ; `execution` répond « la reprise possible » ; `lock` répond « le bail récupérable ».

  **Ce dernier renvoie toujours oui aujourd'hui, et c'est dit tel quel** dans l'adaptateur : aucun drapeau
  ne marque un bail intouchable dans ce modèle. La condition n'est pas décorative pour autant — la
  fonction de décision l'applique et la teste, et cet adaptateur est la seule chose qui change le jour où
  un bail non récupérable existe. Inventer une règle pour faire joli aurait été pire.
- **Retry et timeout** (§9.12-9.13) : un retry crée un Run et une Attempt (§4.7-4.8), qui n'existent pas.
- **Les états `WAITING`, `SCHEDULED`, `RETRYING`, `PAUSED`, `WAITING_APPROVAL`** (§9.6) : ce module n'en
  ajoute aucun à la machine de Task. §22.6 en fait l'autorité de l'agrégat, et deux propriétaires d'un
  même champ est une divergence garantie. `WAITING` et `SCHEDULED` sont d'ailleurs des **vues** que la
  file exprime sans rien écrire.


## §9.16 — le double déclencheur, livré

**Le défaut trouvé en l'écrivant est plus intéressant que la fonctionnalité.** Le commentaire de
`GetNextForActorUseCase` revendiquait déjà §9.16 — alors que seule la moitié « jamais une liste vide »
existait. C'est exactement la classe de report périmé que le doc du kernel enregistre (§5.5) : une phrase
qui se lit comme faite pendant que la moitié de la section manque. Le commentaire dit maintenant laquelle
des deux moitiés il porte.

**Ce que fait la moitié périodique.** Tout autre signal de ce système se déclenche quand quelque chose ne
va pas. Celui-ci se déclenche quand **rien** ne va mal — c'est la seule façon dont « personne n'a demandé
de travail depuis deux jours » atteigne jamais quelqu'un. Depuis une file vide, « à jour » et « abandonné »
sont indiscernables (0.3.10).

**La condition est le ET que la spec écrit** : aucun travail actionnable **et** l'intervalle écoulé. Un
acteur qui a du travail en main n'est pas silencieux, même si on le lui a donné il y a longtemps.

**Rien n'est stocké, aucun cron ne tourne.** L'intervalle est un argument, jugé à la lecture comme toute
péremption ici (§17.7) : changer la politique d'un workspace change toutes les réponses d'un coup, pas
seulement les futures. Un « dernier envoi » stocké serait une seconde source de vérité sur ce qui a été
distribué, et les deux finiraient par diverger — ce sont les tâches qui font foi.

`isStale(null) === true` du kernel tombe juste ici sans rien ajouter : un acteur à qui on n'a jamais rien
donné est le plus silencieux de tous, pas le moins.

L'intervalle par défaut est de **quatre heures, pas quatre secondes** (§9.16 : « délibérément plus long que
la latence de dispatch réactif »). Un test le verrouille, parce qu'un intervalle court transformerait le
point de contrôle en scrutation — et une scrutation qui se déclenche sans cesse est un bruit que personne
ne lit, ce qui finit dans le même silence.
