# Observability — Conception détaillée

> Module : `apps/hub/src/modules/observability/`
> Référence spec : `v3/spline-v3.md` — §17 (Observability), §17.6 (niveaux de santé),
> §17.7 (seuils de staleness), §17.8 (rollup nominatif), §17.9 (alertes), §12 (les seuils sont des
> paramètres ajustables), §5.18 (Runtime Health)
> Statut : implémenté, double-vérifié (§5), audité en accessibilité et en isolation.

## 1. Intégration — ce que ce module doit à l'écosystème et ce qu'il lui rend

### 1.1 La leçon du §17.8, et pourquoi elle mérite d'être rendue structurelle

§17.8 est la seule section de tout le chapitre qui cite une observation d'exploitation :

> « 21 commandes runtime bloquées » sans savoir lesquelles est une alerte qu'un opérateur ne peut pas agir
> dessus — ce point a été observé directement en exploitation (0.3.3).

La tentation est de traiter ça comme une consigne de rédaction : « penser à joindre la liste ». Une
consigne s'oublie. Le module la rend donc **impossible à enfreindre** : un `Rollup` ne se construit qu'à
partir de ses éléments, et son compte en est **dérivé**. Il n'existe aucun constructeur qui accepte un
nombre. Un compte ne peut donc ni être publié seul, ni diverger de son détail.

C'est le même choix que « une entrée de mémoire est une note **ou** un renvoi » : transformer une règle
qu'on peut oublier en une forme qu'on ne peut pas écrire de travers.

### 1.2 Ce qui est réellement observable aujourd'hui

§17.7 nomme trois ressources surveillées — **Machine, Session, RuntimeCommand** — et les trois
appartiennent à des modules qui n'existent pas. Écrire leurs sondes maintenant produirait une supervision
qui ne surveille rien, avec des tableaux verts qui rassurent à tort.

Ce qui existe et peut réellement se dégrader :

| Sonde | Signal | Pourquoi c'en est un |
| --- | --- | --- |
| **locks** | un verrou encore `HELD` alors que son bail est écoulé | son détenteur a disparu sans rendre la ressource (§13.5-13.6) |
| **tasks** | des tâches `BLOCKED` depuis trop longtemps | §4.22 : « une tâche bloquée ne progresse plus » |
| **validations** | des preuves `PENDING` depuis trop longtemps | personne ne valide : le travail est terminé mais rien n'avance (§11) |
| **audit** | la chaîne de signatures rompue | le plus grave du système : l'histoire a été retouchée (§4.23) |

Quatre sondes, quatre signaux vrais. Les autres viendront **avec leurs modules**, sans toucher à celui-ci
(§1.4).

### 1.3 Les seuils sont des paramètres, pas des constantes éparpillées

§17.7 est explicite : « ces seuils sont des paramètres du système, documentés et ajustables, **jamais des
constantes implicites dispersées dans le code** ».

« Ajustable » a déjà un propriétaire dans ce système : le Policy Engine (§12.1 range les « limites » parmi
ce qu'une politique exprime). Chaque sonde lit donc son seuil via une règle — `staleness_locks_ms`,
`staleness_blocked_tasks_ms`, `staleness_pending_validations_ms` — avec un défaut documenté quand le
workspace n'en fixe aucune. C'est le **troisième consommateur réel** du moteur de politiques, après les
validations obligatoires et le plafond de bail.

### 1.4 Ce qu'il attend des modules existants, et la forme que ça prend

Une sonde **vit dans le module dont elle observe la santé**, et implémente un port déclaré ici. Deux
raisons, et la seconde compte plus que la première :

1. Ce module n'a pas à connaître les états internes de quatre autres.
2. **Un module futur devient observable sans qu'on touche à celui-ci** : il fournit sa sonde, elle est
   collectée. C'est la même logique que le registre d'extensions (§19) — l'observabilité doit s'étendre
   par ajout, pas par modification.

| Module | Fournit | Lit |
| --- | --- | --- |
| **lock** | `LockHealthProbe` | ses propres verrous |
| **task** | `TaskHealthProbe` | ses propres tâches |
| **validation** | `ValidationHealthProbe` | ses propres validations |
| **audit** | `AuditHealthProbe` | sa propre chaîne |
| **policy** | les seuils (§1.3) | — |

### 1.5 Ce que les modules à venir en attendront

| Module futur | Attente | Conséquence dès maintenant |
| --- | --- | --- |
| **Worker / Runtime** (§6-7, §5.18) | « Runtime Health » avec Machine, Session, RuntimeCommand (§17.7) | ils fourniront trois sondes de plus ; le port et l'agrégation ne bougeront pas |
| **Repository Engine** (§8) | conflits de dépôt (§17.9) | idem |
| **Extension Registry** (§19) | observabilité des Engines et Tools tiers (§17 ouverture) | une sonde est exactement ce qu'une extension peut publier |
| **Web** (dashboards §17.5) | de quoi peindre | la santé est une lecture ; le module ne dessine rien |

### 1.6 Ce qu'il ne fait pas, et pourquoi

- **Il ne fait pas de logs** (§17.2). Nest journalise déjà, et le journal des faits métier est le module
  event (§14). Un troisième mécanisme rejournaliserait ce que deux systèmes écrivent déjà.
- **Il ne fait pas de traces** (§17.4). La trace demandée est `Goal → Task → Run → Session → Provider →
  Validation` : trois des six maillons n'existent pas. Une trace à trous serait un outil de débogage qui
  ment sur ce qu'il n'a pas vu.
- **Il ne dessine pas de tableaux de bord** (§17.5). C'est `apps/web`.
- **Il ne déclenche pas d'alertes lui-même** (§17.9). Une alerte est une Notification adressée, et le
  module notification écoute déjà les faits — trois des huit alertes y sont câblées. Une sonde décrit un
  état, elle ne réveille personne : sinon la même dégradation notifierait à chaque consultation.
- **Il ne mesure ni CPU ni mémoire** (§17.3). Rien n'exécute encore quoi que ce soit.

## 2. Modèle de domaine

### 2.1 `Rollup` (ValueObject) — §17.8 rendu inviolable

**Props** : `items: DegradedResource[]` où chaque élément porte `id`, `type` et `since`.
`count` est un **getter dérivé**. Aucun constructeur n'accepte de nombre.

### 2.2 `HealthSignal`

**Props** : `probe` (nom), `level` (§17.6), `rollup`, `threshold` (le seuil appliqué et **d'où il vient**
— politique ou défaut, §17.8 sur le fait de dire ce qui a décidé).

### 2.3 `WorkspaceHealth`

Le niveau global est **le pire** des signaux : un système n'est pas « en moyenne sain ».

## 3. Ports

- `HEALTH_PROBES` — déclaré ici, implémenté par lock, task, validation et audit ; le module assemble la
  liste depuis les sondes que chacun exporte.
- `STALENESS_THRESHOLDS` — déclaré ici, fourni par policy.

## 4. Use-cases

| Use-case | Rôle |
| --- | --- |
| `AssessWorkspaceHealth` | §17.6/§17.8 — le rollup complet, compte **et** détail |

Un seul, et c'est délibéré : la conception en prévoyait un second, `CollectWorkspaceMetrics` (§17.3). Il
n'est pas écrit, parce que les métriques que §17.3 énumère — CPU, mémoire, durée, coût — supposent que
quelque chose s'exécute, et rien ne s'exécute encore. Compter des tâches et des validations aurait produit
une page de chiffres qui ressemble à de la mesure sans en être : les mêmes nombres sont déjà lisibles sur
les listes de chaque module. Le vrai module de métriques naîtra avec le Runtime.

## 5. Double vérification de complétude

**Le §17.8 est tenu par la forme, pas par la discipline.** `Rollup` n'a qu'une porte d'entrée, `of(items)`,
et son compte est un getter dérivé — il n'existe aucun constructeur acceptant un nombre. Un test le
vérifie en énumérant les méthodes statiques de la classe : si quelqu'un ajoutait un jour un
`Rollup.fromCount(21)`, il deviendrait rouge. C'est le même choix que « note **ou** renvoi » dans memory :
transformer une règle qu'on peut oublier en une forme qu'on ne peut pas écrire de travers.

**Un défaut attrapé pendant l'écriture, et qui aurait été le pire endroit pour l'introduire.** Le
contrôleur horodatait avec `new Date()`. C'est exactement ce que la règle d'horloge injectée du kernel
interdit, et c'aurait été la seule violation du système — dans le module dont le métier est justement
l'arithmétique temporelle (§17.7).

**Une distinction que l'implémentation a rendue nécessaire.** Deux façons de produire un signal :
`HealthSignal.from` gradue selon le nombre de ressources dégradées, `HealthSignal.critical` **déclare**.
La chaîne d'audit est intacte ou elle ne l'est pas ; la graduer suggérerait que quelques entrées
retouchées sont tolérables. Un signal déclaré ne porte donc aucun seuil, et la vue ne prétend pas le
contraire — elle renvoie `null`.

Éléments vérifiés conformes : §17.6 (les quatre niveaux, le pire décide — un système n'est pas « sain en
moyenne ») ; §17.7 (seuils **documentés au même endroit**, ajustables par politique, calculés à la
lecture, et la réponse dit lequel s'est appliqué et d'où il vient) ; §17.8 (compte **et** détail
nominatif, structurellement) ; §4.2 (santé d'un seul workspace, testé) ; règle d'horloge injectée du
kernel.

**Audit d'accessibilité** : l'unique use-case a une route, en `read_workspace_state` — la supervision
(§17.1) n'est pas de l'administration, et un agent doit pouvoir voir que le workspace où il s'apprête à
travailler est dégradé.

**Le point d'extension est le vrai livrable.** Quatre sondes, chacune chez le module dont elle observe la
santé. Un module futur devient observable en exportant une sonde de plus ; rien ici ne change. C'est ce
qui permettra au Runtime d'apporter Machine, Session et RuntimeCommand — les trois ressources que §17.7
nomme et qui n'existent pas encore.

Reports explicites, avec leur raison :

- **Machine, Session, RuntimeCommand** (§17.7) : leurs modules n'existent pas. Les simuler produirait une
  supervision qui ne surveille rien, avec des voyants verts qui rassurent à tort.
- **Logs** (§17.2) : Nest journalise, et le journal des faits métier est le module event. Un troisième
  mécanisme rejournaliserait ce que deux systèmes écrivent déjà.
- **Traces** (§17.4) : `Goal → Task → Run → Session → Provider → Validation` — trois maillons sur six
  manquent. Une trace à trous ment sur ce qu'elle n'a pas vu.
- **Tableaux de bord** (§17.5) : c'est `apps/web`. Ce module rend des données, il ne dessine rien.
- **CPU, mémoire, coût** (§17.3) : rien n'exécute encore quoi que ce soit.
- **Déclenchement d'alertes** (§17.9) : une alerte est une Notification adressée, et le module
  notification écoute déjà les faits — trois des huit y sont câblées. Une sonde décrit un état ; si elle
  notifiait, la même dégradation alerterait à chaque consultation.
