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

**Un répertoire par dépôt, par machine, réutilisé.** La première version faisait un worktree par
tâche : mieux isolée, et pire sur le seul point qui décide si tout ceci sert à quelque chose. Un
checkout neuf d'un vrai projet n'a pas de `node_modules`, pas de `.env`, pas de cache de build — un
agent qu'on y dépose passe son run à découvrir que rien ne tourne. **La copie de l'opérateur est
l'environnement dont le travail a besoin**, donc c'est là que le travail se fait.

Le coût est énoncé, pas caché : **deux tâches ne peuvent pas travailler dans un dépôt en même temps**,
un répertoire ne tenant qu'une branche. `withRepository` les met en file — par machine, ce qui est
exactement la portée nécessaire : deux machines ont chacune leur copie et tournent en parallèle.

**Le hub dit QUEL dépôt, la machine dit OÙ.** Un chemin stocké côté hub serait un seul chemin pour
toutes les machines, alors que le même dépôt est en `/home/ada/projects/app` sur l'une et `/srv/app`
sur l'autre. La machine le cherche par **nom** sous son `PROJECT_ROOT` ; s'il n'y est pas, elle l'y
clone. Le nom passe par `basename` — un dépôt nommé `../../etc` choisirait sinon où cette machine
écrit.

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

## La fusion, et le conflit qui remonte

**La fusion était marquée faite sans que personne ne la fasse.** Le hub approuvait et passait à MERGED
dans le même geste, avec un commentaire disant que prétendre le contraire laisserait des demandes
coincées en APPROVED sans personne pour les bouger. Fusionner demande une copie de travail, et le hub
n'a pas de système de fichiers. `mergeBranch` est ce quelqu'un.

**`--no-ff`, toujours.** Une avance rapide rendrait la fusion invisible : les commits de la branche
apparaîtraient sur la cible sans que rien n'enregistre qu'une personne les a approuvés, quand, ni pour
quelle demande. Le commit de fusion **est** la trace — et l'approbateur est dans son message, pour que
quelqu'un lisant `git log` dans un an n'ait pas à ouvrir ce système pour savoir qui a laissé entrer.

**`pull --ff-only` avant.** Une branche cible qui a divergé est une question pour une personne, pas
quelque chose à réconcilier à trois heures du matin.

**Un conflit est rapporté et l'arbre remis en état**, jamais résolu. §8.7 dit qu'une fusion n'est
jamais faite par un agent ; une machine qui résout le conflit de quelqu'un, c'est cet acte avec plus
d'étapes et moins de réflexion.

**Toute la fusion tient l'index**, contrairement au travail ordinaire où les agents partagent la copie
et se coordonnent par les locks. Une fusion déplace la copie sur une autre branche, et ce qui
committerait pendant ce temps committerait sur la mauvaise.

**Et le conflit remonte enfin.** `openConflicts` était vide *par construction* côté hub. Maintenant :
la machine le découvre en rattrapant la branche de base, le rapporte dans le résultat du run, le hub en
fait un **blocage de tâche** — ce que §8.9 dit littéralement qu'un conflit est — et les conditions de
fusion le relisent. Un blocage plutôt qu'une entité neuve : les tâches ont des blocages depuis §4.22,
ils passent déjà la tâche en BLOCKED, apparaissent déjà dans la file de ce qui réclame une personne, et
le manager les voit déjà.
