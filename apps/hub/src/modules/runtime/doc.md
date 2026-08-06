# Runtime — Conception détaillée

> Module : `apps/hub/src/modules/runtime/`
> Référence spec : `v3/spline-v3.md` — §4.11 (WorkerNode), §4.12 (AgentSession), §4.14 (ProviderProfile),
> §6 (Worker Runtime), §6.3 (enregistrement et rattachement), §6.4 (heartbeat), §6.6 (crash recovery),
> §7 (Agent Runtime), §7.15 (détection de panne), §17.7 (seuils), §18.8 (exception de bootstrap),
> §5.18 (Runtime Health)
> Statut : registre implémenté et double-vérifié (§3) ; `apps/worker` reste à écrire (§3, reports).

## 1. Intégration — ce que ce module doit à l'écosystème et ce qu'il lui rend

### 1.1 Le partage, et pourquoi ce module est un registre

§6 est explicite : « le Worker Runtime est le composant **installé sur une machine** ». §7 aussi :
l'Agent Runtime « ne possède jamais l'état métier : il exécute ». Ni l'un ni l'autre n'est le hub.

Ce que le hub tient, et que §6.9 tranche sans ambiguïté — « le Runtime maintient uniquement un état
local ; **en cas de divergence, le Control Plane fait autorité** » :

| | Le hub (ici) | `apps/worker` (à venir) |
| --- | --- | --- |
| §4.11 | qui sont les machines, ce qu'elles savent faire, si elles répondent | la machine elle-même |
| §4.12 | qu'une session existe, son état, à qui elle appartient | le processus CLI vivant |
| §4.14 | le catalogue de providers et leur disponibilité | l'appel au provider |
| §6.3 | l'enregistrement, le rattachement à un workspace | ce qu'on envoie en s'enregistrant |
| §6.4 | juger qu'un heartbeat manque | l'émettre |
| §6.6 | détecter l'absence, marquer les sessions perdues, rendre la tâche visible | rien : elle est morte |
| §6.8 | les points d'entrée de l'API Runtime | leurs appelants |

**Ce module est donc un registre et un arbitre**, pas un exécuteur. `apps/worker` est un livrable
séparé, et il ne peut pas être écrit avant celui-ci : il n'aurait nulle part où s'enregistrer.

### 1.2 §4.14 — trois bugs d'exploitation dans une seule entité

C'est la fiche la plus dense de la spec en leçons vécues, et chacune devient une contrainte de code :

**a) Le catalogue est global, jamais par workspace (0.3.7).** « Le quota et la disponibilité d'un
provider sont une ressource de compte, partagée par construction entre tous les agents qui utilisent la
même connexion sous-jacente — les modéliser par agent créerait une fausse impression d'isolement que le
fournisseur ne respecte pas réellement. » C'est la **seule entité du système sans `workspaceId`**, et
c'est une exception assumée à §4.2 : l'isolation par workspace protège les données d'un workspace, elle
ne peut pas fabriquer un quota que le fournisseur ne sépare pas.

**b) La disponibilité effective est calculée, jamais stockée.**

```text
effective_available = available AND (quota_unavailable_until IS NULL OR quota_unavailable_until < now())
```

Un champ dérivé stocké est un champ qui finit par mentir. Il est donc un getter, comme le compte d'un
`Rollup` ou les branches protégées d'un dépôt.

**c) L'invariant de cohérence (0.3.9).** Une réactivation manuelle qui n'efface pas `quota_unavailable_until`
est « silencieusement un no-op tant que la fenêtre de quota n'a pas naturellement expiré ». Les trois
champs bougent donc **ensemble, dans l'agrégat**, par deux méthodes nommées — jamais par trois setters
qu'un appelant pourrait dépareiller. Et symétriquement : une désactivation manuelle ne fabrique pas une
`quota_reason` qu'elle n'a pas constatée.

### 1.3 §18.8 — l'exception de bootstrap, nommée par la spec

§6.3 et §18.8 décrivent le même bug vécu : lier une machine à un workspace échouait parce que la
vérification RBAC générique exigeait que la machine appartienne déjà au workspace — « précisément ce que
l'action de liaison est censée créer ».

La forme exigée est explicite : « une **liste nommée d'opérations**, jamais une désactivation générale du
contrôle, documentée au même endroit que la vérification qu'elle contourne ». C'est la même forme que
les listes d'exception des trois invariants structurels du kernel (§5.4), et elle sera écrite au même
endroit que la garde qu'elle traverse.

Concrètement : **enregistrer une machine n'est pas une action de workspace** (elle n'en a pas encore),
donc la route vit hors de `/workspaces/:id`. **La rattacher en est une**, et c'est le workspace qui
autorise — jamais la machine.

### 1.4 §4.12 — l'invariant de transition, déjà outillé

« Toute tentative de faire transiter une session déjà dans l'état cible, ou dans un état terminal
incompatible, retourne un résultat typé, jamais une exception non gérée (0.3.4, §22.6). »

Le `StateMachine` du kernel fait exactement cela depuis la fondation — `alreadyInState`,
`invalidTransition` avec `fromTerminal`. Il n'y a rien à inventer : la leçon 0.3.4 est la raison pour
laquelle cette primitive existe.

### 1.5 Ce qu'il rend aux modules existants

| Module | Ce qu'il débloque |
| --- | --- |
| **observability** | les **trois sondes manquantes** du §17.7 — Machine, Session, RuntimeCommand — que le module attendait nommément. La quatrième colonne de son doc devient vraie. |
| **scheduling** | de quoi assigner : la file est déjà ordonnée, il manquait à qui la donner (§9.8-9.9) |
| **lock** | les baux du §6.5 sont des verrous : `resourceType` est une chaîne libre, rien à ajouter |
| **audit** | §18.7 « Secret Access » aura son producteur quand le worker manipulera des secrets |

### 1.6 Ce qu'il attend des modules existants

| Module | Ce qu'il lui demande |
| --- | --- |
| **identity** | l'acteur qui enregistre ; un `WORKER` est déjà un `ActorType` depuis le premier module |
| **workspace** | la portée du rattachement |
| **policy** | les seuils de heartbeat (§17.7), quatrième consommateur |
| **task** | ce qu'une session exécute |

### 1.7 Ce qu'il ne fait pas, et pourquoi

- **Il n'exécute rien.** §1.1. `apps/worker` est le livrable suivant.
- **Il ne détecte pas les pannes de provider** (§7.15, 0.3.8). La règle — « uniquement des signaux de
  niveau processus, jamais stdout » — s'applique à qui **observe un processus**, donc au worker. Le hub
  ne voit aucun processus. Ce qu'il fait, c'est rendre la conséquence impossible à provoquer par
  accident : marquer un provider indisponible est une opération **explicite et attribuée**, jamais une
  déduction. Un agent qui écrit « 429 » dans son code ne peut rien verrouiller, puisque rien ici ne lit
  ce qu'il écrit.
- **Il ne renouvelle pas les leases** (§6.5) : le module lock le fait déjà, et un second mécanisme serait
  deux vérités sur la même échéance.
- ~~**Il n'implémente pas §6.8 en entier.**~~ La **file de commandes** existe : le hub décide et
  enfile, le worker tire et rapporte. Une file plutôt qu'un envoi, pour deux raisons également concrètes —
  un worker se connecte **vers l'extérieur** (il peut être derrière une box, et §1 veut trois machines
  d'un opérateur), et un ordre que personne n'a pris doit survivre au redémarrage du hub, ce qu'un envoi
  perdrait. **Ce qui reste** : l'exécution elle-même, côté `apps/worker`.

## 2. Modèle de domaine

### 2.1 `ProviderProfile` — global, sans `workspaceId` (§1.2a)

**Statuts** : pas de machine à états ; deux méthodes qui bougent trois champs ensemble —
`markQuotaExhausted(until, reason)` et `restore()`.

### 2.2 `WorkerNode` (§4.11)

**Statuts** : `ONLINE` | `OFFLINE` | `DRAINING` | `MAINTENANCE`. La péremption du heartbeat est
**calculée à la lecture** (§17.7), comme celle d'un verrou : un balayage périodique peut lui-même être en
retard.

### 2.3 `AgentSession` (§4.12)

**Statuts** : `STARTING` | `IDLE` | `RUNNING` | `WAITING` | `STOPPED` | `CRASHED`, via `StateMachine`
(§1.4).

## 3. Double vérification de complétude

**Quatre invariants tirés de bugs vécus, quatre tests qui les nomment.** C'est la densité la plus forte
de la spec, et chacun est vérifié de bout en bout :

| Leçon | Ce que le test prouve |
| --- | --- |
| 0.3.2 (§6.3, §18.8) | rattacher une machine réussit alors qu'elle n'appartient à aucun workspace — la vérification générique aurait rendu l'acte impossible |
| 0.3.4 (§4.12) | arrêter deux fois répond 200, ranimer une session arrêtée répond 410 — un résultat typé, jamais une exception |
| 0.3.9 (§4.14) | une réactivation efface la fenêtre de quota, donc elle n'est pas silencieusement un no-op |
| 0.3.8 (§4.14, §7.15) | un agent ne peut pas modifier la disponibilité d'un provider |

**Sur 0.3.8, la façon dont la règle est tenue mérite d'être dite.** §7.15 interdit de déduire une panne
de provider à partir de ce qu'un agent écrit. La façon la plus sûre d'honorer cette règle est de **n'avoir
aucune déduction** : rien ici ne lit la sortie d'un agent, et la disponibilité ne change que par un acte
explicite et attribué, réservé à un humain — un verrouillage est à l'échelle du compte (§4.14), pas de
celui qui l'a déclenché. Un agent qui écrit « 429 » dans son code ne verrouille personne, parce qu'il n'y
a rien à tromper.

**Une décision qui évite des machines fantômes.** Ré-enregistrer le même `hostname` renvoie la même
machine. Un worker qui redémarre est le même worker ; le laisser se dupliquer laisserait des machines qui
ne parleront plus jamais — et que la sonde de péremption signalerait fidèlement pour toujours.

**Ce que ce module rend à observability, et la façon dont il le rend.** §17.7 nommait Machine, Session et
RuntimeCommand dès l'écriture d'observability, qui avait prévu la place. Les deux premières arrivent
**sans qu'une ligne d'observability ait changé** : le module exporte deux sondes, elles sont collectées.
C'est la propriété que ce doc annonçait comme le vrai livrable du point d'extension, et elle est
maintenant démontrée plutôt qu'affirmée.

Le seul effet de bord a été **deux assertions e2e d'observability trop rigides** — elles figeaient la
liste exhaustive des sondes. Corrigées pour nommer ce qu'elles vérifient au lieu d'énumérer tout : un
module qui devient observable ne doit pas casser la suite d'un module qu'il ne connaît pas.

Éléments vérifiés conformes : §4.11 (les quatre statuts, les capacités déclarées) ; §4.12 (les six
statuts, l'invariant de transition) ; §4.14 (catalogue global **sans `workspaceId`**, disponibilité
calculée, cohérence des trois champs) ; §6.3 (enregistrement, rattachement) ; §6.4 (heartbeat) ; §6.10
(un workspace ne voit que les machines qui le servent, une session refusée sur une machine non
rattachée) ; §17.7 (péremption jugée à la lecture, seuils ajustables par politique) ; §22.6.

**Audit d'accessibilité** : les six use-cases ont une route. Les routes de machine et de provider vivent
**hors** de `/workspaces/:id` — une machine n'a pas encore de workspace (§6.3) et le catalogue de
providers est global (§4.14) — tandis que le rattachement et les sessions sont des actes de workspace.

Reports explicites, avec leur raison :

- **`apps/worker`** : c'est le livrable suivant, et il ne pouvait pas venir avant celui-ci — il n'aurait
  eu nulle part où s'enregistrer.
- **La sonde RuntimeCommand** (§17.7) : les commandes runtime sont des ordres adressés au worker
  (§6.8) ; elles naîtront avec lui.
- **`ExecuteTask`, `KillProcess`, `CreateWorktree`, `InvokeEngine`, `InvokeTool`** (§6.8) : mêmes
  raisons.
- ~~**La reprise après panne**~~ (§6.6) : **fermée**. Marquer une session perdue reste une **décision**,
  pas un effet de bord de la lecture d'un tableau de bord — d'où une route explicite plutôt qu'un balayage.
  La tâche est libérée par le module task lui-même, qui écoute `runtime.session_crashed` : §22.6 fait de
  la machine d'un agrégat son autorité, et runtime écrivant un statut de tâche serait deux propriétaires
  d'un même champ. **Ce qui reste** : le déclencheur périodique du §9.16, qui n'existe nulle part.
- **§7.14, la resynchronisation des identifiants isolés** : elle concerne une copie de secret dans un
  sandbox. Le hub ne copie aucun secret.

## §16 dans le briefing — et **dans** la barrière

Le prompt porte désormais ce que le workspace a appris (port `AGENT_MEMORY`, fourni par `memory`). Ces
notes sont écrites **par des agents**. Un agent qui a lu un fichier empoisonné et qui note ce qu'il
« a appris » laisse donc un texte que tous les suivants liront : de l'injection indirecte avec une
couche de persistance.

Elles voyagent pour cette raison **à l'intérieur** de `<<<SPLINE-TASK-DATA`, avec le titre et la
description de la tâche, sous la même phrase de cadrage — et elles passent par `defuse()`, donc un
marqueur de barrière glissé dans un titre de note est cassé sans que le texte disparaisse de la vue
d'un opérateur qui enquête. Un test l'exige explicitement, côté domaine et côté e2e.

Une mémoire vide n'imprime **rien du tout** : un intertitre sans contenu coûte des jetons et apprend au
modèle que les sections d'ici sont souvent vides.


## Une machine qui change de mains (§18)

**Le constat, trouvé sur une vraie machine et pas dans un test.** L'enregistrement se fait par nom
d'hôte, et seul l'acteur qui a enregistré une machine peut se servir de son dossier. Cette règle est
juste : sans elle, annoncer le nom d'hôte de quelqu'un d'autre rendait l'identifiant de **sa** machine
— une prise de contrôle en un appel.

Ce qu'elle n'avait pas, c'est une porte de sortie. Un ordinateur ré-appairé à une autre organisation
arrive avec une **nouvelle** identité, trouve son propre nom d'hôte détenu par l'ancienne, et se fait
refuser aussi longtemps que le dossier existe. Le daemon réel a passé plusieurs minutes à réessayer
toutes les cinq secondes contre un 403 qu'il ne pouvait pas satisfaire, relancé par systemd à chaque
fois. Une règle sans libération est un piège.

**La libération, c'est la révocation.** Un acteur dont tous les justificatifs sont révoqués n'opère
plus rien — c'est exactement ce que révoquer voulait dire. Le dossier passe alors à qui la machine
répond désormais. Tant que l'autre identité est vivante, rien ne change : c'est toujours l'usurpation
que la règle existe pour refuser.

**Trois choses portent cette décision, et chacune vaut d'être lue :**

- `ACTOR_STANDING`, déclaré par runtime et fourni par identity, pose la seule question que runtime ne
  peut pas trancher seul. Il est distinct de `ORGANIZATION_FLEET` volontairement : lister une flotte
  **doit** montrer une machine dont le justificatif a été révoqué — elle existe encore et elle a agi —
  alors que décider si elle peut encore agir ne le doit pas. Deux questions, deux ports.
- `WorkerNode.handOverTo` **vide les rattachements au passage**. Les workspaces que la machine servait
  appartenaient à l'organisation qu'elle vient de quitter ; les reporter prêterait la machine d'un
  inconnu à des workspaces qui ne lui ont jamais rien accordé — la fuite §4.2, par la porte de service.
- `runtime.worker_handed_over` est journalisé. Le dossier garde tout ce que cette machine a exécuté
  sous son identité précédente, et quiconque tombe sur ces lignes mérite de savoir pourquoi le
  propriétaire a changé.

**Reste ouvert.** Une machine dont l'appairage est approuvé mais qui n'arrive pas à s'enregistrer est
**invisible** dans la console : la liste des machines lit `worker_nodes`, et cette machine-là n'existe
que comme une demande `CLAIMED`. C'est précisément l'état dans lequel l'opérateur s'est retrouvé, sans
rien à l'écran pour le lui dire. §17 demande mieux.

## Le manager organise (§4.5, §4.6)

**Le constat.** Un agent savait faire une tâche. Personne ne savait en fabriquer. L'utilisateur écrivait
le but, découpait les tâches, les assignait, les dispatchait une par une — l'orchestration, c'était lui.

**Ce qui manquait n'était pas la permission.** `AGENT_MANAGER` détenait `manage_goals` et `manage_tasks`
depuis toujours dans la matrice. Ce qu'il n'avait, c'était **aucun outil pour les exercer** : le pont MCP
exposait huit verbes du cycle §10 et rien d'autre. Une permission sans surface est une permission qui
n'existe pas.

**La laisse n'a pas bougé, et c'est le point.** Un grant est l'**intersection** de ce que le protocole
demande avec ce que le rôle de l'acteur détient. Élargir `PROTOCOL_SCOPES` à `manage_goals` /
`manage_tasks` n'élargit donc les pouvoirs de personne : un `AGENT_MANAGER` reçoit les deux, un
`AGENT_CONTRIBUTOR` n'en reçoit aucun, et aucune ligne de code ne décide ça quelque part. Un rôle ajouté
demain aura la bonne réponse sans qu'on y pense, et un rôle qui perd la permission perd les outils.

**Trois endroits posent la même question à la même source, ce qui les empêche de diverger :**

- le **grant**, qui décide des scopes ;
- le **pont**, qui n'enregistre que les outils dont le scope est porté — filtrer ici plutôt que laisser
  le hub refuser à l'appel n'est pas une ceinture de plus, c'est un autre comportement : un modèle à
  qui on présente un outil interdit l'essaie, se fait refuser, et passe son tour à raisonner sur une
  erreur de permission au lieu de travailler ;
- le **briefing**, qui nomme ces outils-là. Un modèle qui doit découvrir ses propres outils y passe un
  tour, et conclut souvent qu'il n'en a pas.

**Deux briefings, pas un paragraphe ajouté.** Un agent à qui l'on dit « tu ne déclares jamais ton
travail terminé » **et** « organise le travail » passe son tour à décider laquelle des deux phrases le
concerne. Le manager reçoit son propre texte : la marche à suivre dans l'ordre, et trois interdits — ne
pas faire le travail lui-même, ne rien déclarer fini, ne pas fabriquer d'agents.

**La barrière anti-injection ne bouge pas non plus.** Le besoin arrive d'une personne qui tape dans une
boîte : c'est exactement la matière que §18.12 met en quarantaine, et elle reste dans la clôture.

**Un détail qui a coûté un test.** Les modèles écrivent une liste de trois façons — tableau, ligne à
virgules, une par ligne, avec ou sans puces. Le hub refuse un tableau vide. Un manager dont les critères
seraient arrivés en une seule chaîne se serait fait dire que sa propre tâche est malformée, sans rien
pour agir. `list()` accepte les trois, et ne coupe pas « 1,5 s » en deux.

**Reste ouvert, et nommé plutôt que sous-entendu :**

- **Le point d'entrée.** Il faut encore créer la tâche d'orchestration à la main. La boîte « dis à
  l'équipe ce dont tu as besoin » n'existe pas.
- **Le dispatch automatique (§9).** Le manager crée les tâches ; personne ne les lance. C'est la pièce
  qui sépare « il organise » de « ils travaillent pendant que je dors » — et elle ne partira pas sans
  son plafond.
- **Créer des agents.** Émettre une identité reste un acte de personne (§18). Un agent qui fabriquerait
  des agents pourrait se multiplier hors de vue, et la facture est celle de l'opérateur.
