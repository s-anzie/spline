# Spline Runtime

Installation et démarrage automatique :

```bash
npm run daemon:install -w apps/runtime
```

Puis configure le token sans l’écrire dans ton historique shell :

```bash
npm run token:set -w apps/runtime
```

La commande demande le secret avec une saisie masquée. Le daemon détecte ensuite le changement et se reconnecte sans redémarrage.

Le token est conservé ici :

```text
~/.config/spline/runtime.json
```

avec les permissions `0600`.

Commandes disponibles :

```bash
# Modifier le token à chaud
npm run token:set -w apps/runtime

# Modifier l’adresse du backend
npm run hub:set -w apps/runtime -- http://localhost:8765

# Vérifier la configuration
npm run config:status -w apps/runtime

# État du service
npm run daemon:status -w apps/runtime

# Suivre les logs
npm run daemon:logs -w apps/runtime
```

L’installateur :

- compile le runtime ;
- crée `spline-runtime.service` ;
- active son redémarrage automatique ;
- active son lancement avec la session utilisateur ;
- tente d’activer le mode `linger` pour démarrer dès le boot, avant même la connexion utilisateur.

Si `linger` nécessite les droits administrateur, il faudra exécuter une seule fois :

```bash
sudo loginctl enable-linger "$USER"
```

Après rotation d’un token dans l’interface, il suffit donc de lancer :

```bash
npm run token:set -w apps/runtime
```

puis de coller le nouveau token. Le daemon abandonne l’ancienne connexion et utilise immédiatement la nouvelle clé.


# set agents token

L’intégration des tokens d’agents est maintenant fonctionnelle de bout en bout.

Ce qui est implémenté :

- Rotation et révocation depuis la fiche de l’agent.
- Affichage du nouveau token une seule fois après rotation.
- Copie rapide du token.
- Stockage local sécurisé dans `~/.config/spline/runtime.json`, permissions `0600`.
- Association des tokens par identifiant d’agent.
- Rechargement automatique du daemon après modification.
- Injection sécurisée dans chaque processus :
  - `SPLINE_AGENT_TOKEN`
  - `SPLINE_AGENT_ID`
  - `SPLINE_WORKSPACE_ID`
  - `SPLINE_API_URL`
- Une commande distante ne peut pas écraser le token local.
- Ancien token immédiatement refusé par l’API après rotation ou révocation.

Les tests passent : 130 suites API, 9 suites runtime, lint, vérifications TypeScript et builds de production.

## Démarrer les agents, étape par étape

### 1. Installer le daemon runtime

À faire une seule fois :

```bash
npm run daemon:install -w apps/runtime
```

Le service sera installé comme service utilisateur systemd et démarrera automatiquement avec ta session.

Si tu veux qu’il démarre même avant ta première connexion graphique :

```bash
sudo loginctl enable-linger "$USER"
```

### 2. Configurer l’adresse du backend

Par défaut, le runtime utilise `http://localhost:8765`.

Pour la modifier :

```bash
npm run hub:set -w apps/runtime -- http://localhost:8765
```

Attention : `http://localhost:3003` correspond à l’application web, pas nécessairement à l’API.

### 3. Enregistrer le token de la machine

Dans l’interface, crée ou sélectionne une machine, puis copie son token `machine_...`.

Ensuite :

```bash
npm run token:set -w apps/runtime
```

Colle le token lorsque la saisie masquée apparaît.

Le token machine permet au daemon de :

- se connecter au backend ;
- recevoir les ordres de démarrage ;
- signaler l’état des processus et sessions.

### 4. Enregistrer le token de chaque agent

Pour chaque agent déjà créé :

```bash
npm run agent-token:set -w apps/runtime -- IDENTIFIANT_AGENT
```

Par exemple :

```bash
npm run agent-token:set -w apps/runtime -- 550e8400-e29b-41d4-a716-446655440000
```

Colle ensuite le token `agent_...`.

Tu trouveras désormais cette commande directement dans la fiche de l’agent, section « Accès API de l’agent ».

Si tu as perdu un ancien token, ouvre la fiche de l’agent et clique sur « Régénérer le token ».

### 5. Vérifier Codex ou Claude

Selon le provider configuré pour l’agent :

```bash
codex --version
```

ou :

```bash
claude --version
```

Le CLI concerné doit être installé et authentifié sur la machine exécutant le daemon.

### 6. Redémarrer le daemon après cette mise à jour

Comme le code runtime vient d’être recompilé :

```bash
systemctl --user restart spline-runtime.service
```

Puis vérifie son état :

```bash
npm run daemon:status -w apps/runtime
```

Et consulte les logs en direct :

```bash
npm run daemon:logs -w apps/runtime
```

### 7. Lancer réellement un agent

Tu ne démarres pas un processus séparé manuellement pour chaque agent.

Dans l’application :

1. Ouvre le workspace.
2. Vérifie que la machine est liée à ce workspace et en ligne.
3. Ouvre la page « Exécution ».
4. Choisis l’agent.
5. Choisis la machine.
6. Associe éventuellement une tâche.
7. Démarre la session.

Le backend transmet alors l’ordre au daemon. Celui-ci sélectionne automatiquement le token correspondant à l’agent et lance Codex ou Claude dans le dossier racine du workspace.

## En cas de rotation ou révocation

Après une rotation :

```bash
npm run agent-token:set -w apps/runtime -- IDENTIFIANT_AGENT
```

Puis colle le nouveau token.

Après une révocation :

```bash
npm run agent-token:remove -w apps/runtime -- IDENTIFIANT_AGENT
```

La révocation backend bloque immédiatement l’ancien secret. La commande locale supprime également sa copie du coffre du daemon.