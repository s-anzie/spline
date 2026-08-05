# Module `conversation` — le fil borné (§10.18a-b)

## 1. Ce que ce module existe pour rendre possible

Trois choses que Spline n'avait pas, toutes nommées par l'étude d'OpenClaw (§10.18) :

1. **Déléguer et être tenu au courant.** L'assignation dit à quelqu'un de faire quelque chose ; personne
   n'attend, et rien ne relie ce qui revient à qui l'a demandé. Un fil qui porte un `taskId` est ce lien.
2. **Une borne.** Deux acteurs qui se répondent, chacun dans une requête séparée, bouclent indéfiniment.
   `ReactionDepth` (kernel §5.2) borne la cascade **technique** et ne peut rien voir ici : chaque tour est
   son propre appel, avec sa propre pile.
3. **Une façon de s'arrêter poliment.** Sans un « je n'ai rien à ajouter » explicite, une conversation
   terminée et une conversation tronquée sont le même événement, et personne ne peut dire laquelle a eu
   lieu.

## 2. Les décisions qui valent d'être expliquées

### 2.1 Demander **est** un tour

Le premier tour est celui de l'initiateur, compté dans le budget. Le compter à part ferait qu'un budget
de 1 signifie « tu peux demander, et il peut répondre » — ce qui fait deux.

### 2.2 Le budget s'arrête sur la tentative qui déborderait, pas sur la suivante

`turnsLeft === 0` est vérifié **avant** d'ajouter le tour, et le fil passe en `EXHAUSTED` à ce
moment-là. Finir un tour trop tard voudrait dire que le budget était déjà dépassé quand on s'en aperçoit.

### 2.3 Un tour qui échoue est quand même persisté

Un budget épuisé **a changé** le fil : il est `EXHAUSTED` maintenant. Rendre le refus sans écrire
laisserait un fil qui refuse pour toujours tout en se déclarant ouvert.

### 2.4 Parler et se taire sont une seule route

`POST /turns` avec un message est un tour ; sans message, c'est le jeton de terminaison. Deux routes
permettraient à un client de n'implémenter que la première — et c'est exactement comme ça qu'une
conversation perd sa capacité à s'arrêter.

### 2.5 L'écouteur lit la **forme** d'un fait, pas les classes du module task

Une conversation qui importerait `task` rendrait inséparables deux modules qui n'ont aucune raison de se
connaître. L'écouteur a besoin de deux champs.

**Et il a fallu vérifier lesquels.** La première version écoutait `task.completed` et `task.failed` — qui
ne sont pas des événements que ce système émet. Elle compilait, passait la revue, et n'aurait **jamais**
tiré une seule fois. Le vrai fait est `task.status_changed`, avec `to`.

### 2.6 L'answer est attribuée au **participant**

C'est à lui que le travail a été délégué. L'attribuer au demandeur ferait dire au registre qu'il a répondu
à sa propre question.

### 2.7 Un échec est une réponse

L'écouteur traite `COMPLETED`, `FAILED` et `CANCELLED`. Un écouteur qui n'entendrait que le succès
laisserait le demandeur attendre pour toujours sur précisément le cas dont il a le plus besoin.

## 3. §10.18c — pourquoi ce module ne « ferme » rien de plus

OpenClaw ferme la communication entre agents par défaut et n'autorise que par liste. Le doc du module
`notification` explique pourquoi ne pas copier : **chez eux l'unité d'isolement est l'agent, ici c'est le
workspace** — l'appartenance *est* l'autorisation.

Ce que §10.18 demandait vraiment, c'est que **le point d'accroche existe**, « sinon la politique n'aura
rien à décider ». Il existe désormais : un fil nomme ses **deux** côtés, et parler dedans sans en être
est refusé (`NotAParticipantError`, 403), quelle que soit l'appartenance au workspace. Ouvrir un fil est
un acte identifiable, donc c'est un endroit où une règle du Policy Engine (§12) pourra vivre.

Aucun port permissif n'est posé d'avance. Un branchement qui dit toujours « oui » a déjà été retiré une
fois de ce code, et il ne prouve rien.

## 4. Ce qui reste ouvert

- **La politique d'ouverture** (§12) : qui peut ouvrir un fil avec qui. Le point d'accroche est là ; la
  règle ne l'est pas, et l'inventer sans cas d'usage figerait une décision qui n'appartient pas ici.
- **Plus de deux participants.** Volontairement absent : à trois, « à qui est-ce le tour » devient une
  question, et le budget cesse de suffire comme borne.
- **La livraison en temps réel** (§20.5) : le demandeur doit relire le fil. Aucun transport n'existe.
