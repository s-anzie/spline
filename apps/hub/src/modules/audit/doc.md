# Audit — Conception détaillée

> Module : `apps/hub/src/modules/audit/`
> Référence spec : `v3/spline-v3.md` — §4.23 (AuditEntry), §18.1 (« Audit First »), §18.7 (ce qui est
> audité), §12.5 (une violation génère une entrée d'audit), §17.8 (détail nominatif), §14 (Event, à ne
> pas confondre)
> Statut : implémenté, double-vérifié (§4), audité en accessibilité et en isolation.

## 1. Intégration — ce que ce module doit à l'écosystème et ce qu'il lui rend

*Quatre modules livrés ont nommé l'audit comme dette : identity (« aucune écriture d'audit alors que
§18.7 l'exige pour les changements de permission »), policy (§12.5), artifact et lock. C'est le second
module dont l'existence est réclamée par d'autres avant d'être écrite.*

### 1.1 Ce que Audit est, et surtout ce qu'il n'est pas

**La trace de ce qui a changé, avec l'avant et l'après.** C'est le seul mot qui le distingue d'Event, et
la distinction avait été posée dès le module event : « AuditEntry restera distinct — il porte
`before`/`after`, qu'un fait ne porte pas ».

| | Event (§4.20) | AuditEntry (§4.23) |
| --- | --- | --- |
| dit | qu'une chose est arrivée | **de quoi vers quoi** une chose est passée |
| produit par | le travail ordinaire, systématiquement | les actions **importantes** seulement (§18.7) |
| lu par | des réactions, un journal, un replay | une enquête, une conformité |
| altérable | non (pas de chemin d'écriture) | non, **et démontrable** (§1.4) |

Un Event ne peut pas remplacer une entrée d'audit : il ne sait pas quelle était la valeur précédente. Une
entrée d'audit ne peut pas remplacer un Event : elle n'est écrite que pour ce qui compte, et rien ne
réagit dessus.

### 1.2 Ce qui est réellement auditable aujourd'hui

§18.7 énumère sept actions. **Trois ont un producteur qui existe** :

| §18.7 | Producteur | État |
| --- | --- | --- |
| **Permission Change** | identity — changement de rôle, révocation d'appartenance | ✅ câblé |
| **Policy Update** | policy — pose et désactivation d'une règle | ✅ câblé |
| **Delete** | workspace (suppression logique), artifact (statut DELETED) | ✅ câblé |
| Merge | Repository Engine (§8) | ✗ n'existe pas |
| Secret Access | Runtime (§18.4) | ✗ n'existe pas |
| Extension Install / Publish | Registry (§19) | ✗ n'existe pas |

Les quatre absentes ne sont pas simulées. Écrire un auditeur de « Merge » sans dépôt Git produirait une
ligne que rien n'alimente et une couverture apparente là où il n'y a rien.

### 1.3 Comment une entrée est écrite — et pourquoi pas par un écouteur

Tentant : s'abonner aux Events et écrire l'audit. **Impossible** — un Event ne porte pas l'état
antérieur. `identity.membership_role_changed` porte `previousRole` par chance ; `policy.set` ne porte pas
l'ancienne valeur, et n'a aucune raison de la porter (un fait décrit ce qui est, pas ce qui était).

L'écriture est donc **explicite, depuis le use-case qui mute**, seul endroit où l'avant et l'après
existent tous deux en mémoire. C'est plus verbeux qu'un écouteur, et c'est le prix de `before`/`after`.

Le port `AUDIT_TRAIL` est déclaré **au kernel** : trois modules distincts en dépendent, il ne porte aucune
connaissance métier, et §18.1 fait de « Audit First » un principe du système — les deux critères d'entrée
au kernel sont remplis. Il n'y a **aucune liaison par défaut** dans le kernel, exactement comme pour
`EVENT_PUBLISHER` : deux propriétaires globaux d'un même jeton, c'est un tirage au sort déguisé en
configuration (kernel §7). Le module audit est le seul fournisseur, en `@Global`.

### 1.4 « L'audit est immuable » — ce que cela peut vouloir dire honnêtement

§4.23 dit « immuable » et liste un champ `signature`. Une table Postgres n'est immuable pour personne
disposant d'un accès à la base : le seul sens opérationnel du mot est **une altération détectable**.

Chaque entrée est donc signée en **HMAC-SHA256 sur son contenu et sur la signature de la précédente** —
une chaîne. Modifier, supprimer ou réordonner une ligne casse toutes les signatures suivantes, et une
route de vérification dit **où** la chaîne se rompt (§17.8 : le détail nominatif, pas seulement un
compte). Sans la clé, un attaquant ne peut pas recalculer la chaîne.

Ce n'est pas de l'inviolabilité — c'est de la détection, et c'est ce qu'un audit peut promettre sans
mentir. La limite est nommée en §1.6.

### 1.5 Ce que les modules à venir en attendront

| Module futur | Attente | Conséquence dès maintenant |
| --- | --- | --- |
| **Repository Engine** (§8) | auditer un merge | `target` est un couple type/identifiant **opaque**, comme pour Lock : aucune clé étrangère vers ce qui est audité |
| **Runtime** (§7, §18.4) | auditer l'accès à un secret | l'action est une chaîne libre |
| **Extension Registry** (§19) | install / publish | idem |
| **Observability** (§17) | exporter, alerter sur des motifs | la lecture est filtrable par acteur, action, cible |

### 1.6 Ce qu'il ne fait pas, et les limites nommées

- **Aucune route d'écriture.** Une entrée d'audit se mérite en agissant, elle ne se déclare pas. Un point
  d'entrée HTTP « ajoutez une entrée » permettrait de fabriquer un passé.
- **Aucune modification, aucune suppression** — pas même désactiver, contrairement aux politiques.
- **La signature n'est pas une preuve d'antériorité.** Quelqu'un qui détient la clé **et** l'accès à la
  base peut réécrire la chaîne entière. S'en prémunir demande une ancre externe (journal en écriture
  seule, horodatage tiers), qui n'existe pas ici. Dit, pas sous-entendu.
- **L'écriture n'est pas atomique avec la mutation qu'elle décrit** — même limite que la publication d'un
  Event (event/doc.md §1.7), et même cause : il faudrait partager la transaction du dépôt.

## 2. Modèle de domaine

### 2.1 `AuditEntry` (AggregateRoot, strictement immuable)

**Props** (§4.23) : `workspaceId` (nullable — un changement au niveau organisation est au-dessus d'un
workspace, comme pour Event), `actor`, `action`, `targetType`, `targetId`, `before`, `after`,
`sequence`, `signature`, `createdAt`.

`sequence` n'est pas au §4.23 mais la chaîne de signatures impose un ordre total, exactement comme pour
Event : deux entrées d'une même milliseconde doivent rester ordonnées.

## 3. Use-cases

| Use-case | Rôle |
| --- | --- |
| `RecordAuditEntry` | appelé par un module, jamais exposé |
| `ListAuditEntries` | l'enquête, filtrée |
| `VerifyAuditChain` | §1.4 — dit où la chaîne se rompt |

## 4. Double vérification de complétude

**Ce que l'analyse avait bien vu.** §1.3 annonçait qu'un écouteur ne pouvait pas écrire l'audit faute
d'état antérieur. C'est exactement ce qui s'est produit à l'implémentation : dans les trois producteurs,
il a fallu **capturer la valeur avant la mutation** (`previousRole`, `previousValue`, `previousStatus`),
ce qu'aucun Event ne porte. Le commentaire est dans le code à chaque endroit, parce que la ligne a l'air
gratuite quand on ne sait pas pourquoi elle est là.

**Deux choses trouvées en écrivant, qui ne figuraient pas dans l'analyse.**

1. **La signature ne peut être calculée qu'après l'insertion.** Elle couvre la `sequence`, que la base
   attribue. L'écriture est donc en deux temps dans une transaction : insérer, puis signer.
2. **Deux ajouts concurrents liraient le même prédécesseur** et produiraient deux entrées revendiquant la
   même place dans la chaîne — la vérification signalerait alors une rupture que personne n'a causée. Un
   `pg_advisory_xact_lock` sérialise les ajouts par workspace. Sans lui, le mécanisme censé détecter les
   altérations en aurait inventé.

**Ce que la vérification prouve vraiment**, et le e2e le fait en modifiant la base directement : une
entrée altérée est détectée **et localisée**, une entrée supprimée aussi, un réordonnancement aussi. Sans
la clé, la chaîne ne peut pas être recalculée.

Éléments vérifiés conformes : §4.23 (les huit champs ; aucun mutateur, aucune route d'écriture, aucune
suppression) ; §18.7 (trois des sept actions ont un producteur ; les quatre autres sont nommées absentes,
pas simulées) ; §18.1 (« Audit First » — mais voir la nuance ci-dessous) ; §17.8 (la vérification dit
**où**, pas seulement que) ; §4.2 (workspace obligatoire en lecture ; l'entrée elle-même est nullable pour
ce qui est au-dessus d'un workspace, comme un Event).

**Une décision qui mérite d'être discutée plutôt que subie** : un échec d'écriture d'audit **n'annule
pas** l'action qu'il décrit. Un rôle a réellement changé ; refuser après coup laisserait le système dans
un état que personne n'a demandé. L'échec est donc journalisé bruyamment. §18.1 dit « Audit First », pas
« Audit Or Nothing » — et le seul résultat à exclure absolument est la perte silencieuse.

**Audit d'accessibilité** : deux use-cases sur trois ont une route. `RecordAuditEntry` n'en a
délibérément pas, et c'est la même raison que pour `ReportViolation` du module policy : une entrée
d'audit se mérite en agissant, elle ne se déclare pas. Un point d'entrée l'acceptant permettrait de
fabriquer un passé. Le test le vérifie (404 sur POST et DELETE).

Reports explicites, avec leur raison :

- **Merge, Secret Access, Extension Install/Publish** (§18.7) : leurs producteurs n'existent pas
  (Repository Engine §8, Runtime §18.4, Registry §19).
- **La signature n'est pas une preuve d'antériorité.** Qui détient la clé **et** l'accès à la base peut
  réécrire toute la chaîne. S'en prémunir demande une ancre externe — journal en écriture seule,
  horodatage tiers — qui n'existe pas ici.
- **L'écriture n'est pas atomique avec la mutation décrite** : même limite que la publication d'un Event
  (event/doc.md §1.7), et même remède futur — partager la transaction du dépôt.
