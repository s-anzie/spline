# `src/git` — où les mains de l'agent se posent

## Le constat

Le hub modélisait git sérieusement — dépôt, branche nommée d'après la tâche, **un worktree par tâche**,
demande de fusion conditionnée aux validations et à une approbation humaine (§8.7 : « a merge is never
performed by an agent »). La machine, elle, n'exécutait **pas une seule commande git**. Un agent
travaillait dans un répertoire par *workspace*, partagé par toutes ses tâches, vide, sans dépôt.

Deux conséquences que personne ne voyait :

1. **Deux agents sur deux tâches s'écrasaient.** Même répertoire, aucune isolation, aucun historique.
2. **`openConflicts` était vide par construction.** Le code du hub le disait lui-même : *« la liste est
   vide parce qu'aucun conflit n'a été rapporté, pas parce qu'il n'y en a pas »*. Rien ne rapportait
   dedans, parce que découvrir un conflit demande une copie de travail.

## Les décisions

**Un worktree par tâche, un miroir par dépôt.** Cloner par tâche copierait tout l'historique pour
cinq minutes de travail ; les worktrees partagent un magasin d'objets, c'est leur raison d'être. Le
chemin nomme la tâche — c'est *ça*, l'isolation.

**Branché sur la base de l'ORIGINE**, jamais sur ce que le miroir a sous la main. Un miroir qui a
dérivé ferait partir le travail d'un commit que personne n'a choisi.

**Les branches protégées sont refusées avant que quoi que ce soit ne tourne.** La moitié d'un checkout
sur une branche protégée reste un checkout sur une branche protégée. Le hub énonce la règle ; la
machine est l'endroit où un nom de branche devient une copie de travail, donc elle la vérifie aussi.

**Jamais de shell.** `execFile` avec un tableau d'arguments de bout en bout : un nom de branche vient
d'une tâche que quelqu'un — ou quelque chose — a écrite. `GIT_SSH_COMMAND` et `GIT_EXTERNAL_DIFF` sont
retirés de l'environnement : tous deux font exécuter à git un programme au choix de l'appelant.

**Rien n'est commité quand rien n'a changé.** Un agent qui a lu le code et conclu qu'il n'y avait rien
à faire a fait son travail ; `--allow-empty` est la façon dont une file de revue se remplit de bruit.

**L'auteur est l'agent**, pas le daemon. Une identité par commit et non configurée sur le dépôt : la
tâche suivante sur cette machine est un autre agent.

**Jamais `--force`.** Réécrire une branche que quelqu'un est peut-être en train de lire n'est pas une
décision qu'un daemon prend à trois heures du matin.

**Un conflit est rapporté, jamais résolu.** Le travail est quand même commité et poussé — un conflit
est une question pour une personne, pas une raison de jeter ce qui a été fait — et le rebase est
annulé pour laisser l'arbre comme il a été trouvé. §8.7 dit déjà qu'une fusion n'est jamais faite par
un agent ; résoudre un conflit, c'est le même acte avec plus d'étapes.

**Publier échoue sans faire échouer le run.** Le travail a eu lieu. Perdre le rapport d'un run réussi
est pire qu'une branche à pousser à la main.

## Reste ouvert

- **La fusion n'est toujours pas exécutée.** Le hub approuve et marque fusionné dans le même geste,
  faute de quelqu'un pour la faire. Pousser vers une forge, ou fusionner localement, reste à écrire.
- **Le conflit remonte dans le résultat du run** ; rien ne le transforme encore en `openConflicts` côté
  hub, ni ne le porte au manager pour qu'il réassigne.
- **Les contrôles de politique git (§12.3)** ont maintenant une copie de travail pour tourner. Ils ne
  tournent pas encore.
