# Nos Souhaits

Listes de cadeaux familiales, en français, à héberger soi-même. L’application tourne dans Docker sur un NAS, derrière le reverse proxy déjà en place (pas de VPN). Les membres se connectent avec leur prénom et un code à six chiffres. L’organisateur a un compte séparé, protégé par une phrase de passe et un code TOTP.

Cette version couvre l’usage quotidien : installation, groupes, codes PIN, listes, souhaits, photos, aperçu de lien et réservations. Le propriétaire d’un souhait ne voit pas s’il est pris. Les cadeaux communs et les notifications viendront ensuite.

Le dossier de conception visait SvelteKit 2. L’outil officiel `sv` installe aujourd’hui SvelteKit 3 (Svelte 5, Vite 8, adaptateur Node). L’architecture reste celle du dossier : un seul conteneur applicatif, Drizzle, PostgreSQL 17.

## Démarrage rapide

```bash
cp .env.example .env
chmod 600 .env
# Remplacez DB_PASSWORD, PIN_PEPPER, TOTP_KEY et ORIGIN.
docker compose up -d --build
```

L’application écoute sur `127.0.0.1:3080` de la machine hôte. Postgres n’est pas publié sur le réseau. Ouvrez `http://127.0.0.1:3080` : tant que l’installation n’est pas finie, vous arrivez sur `/installation`.

Le code d’installation est écrit dans les journaux et dans `data/uploads/setup-token` (droits 600) :

```bash
docker compose logs app | grep "Code d'installation"
```

Vous pouvez aussi fixer `SETUP_TOKEN` dans `.env` avant le premier démarrage. Le fichier est supprimé une fois l’installation confirmée. Sans ce code, personne sur Internet ne peut créer le compte admin.

Ensuite : phrase de passe (14 caractères minimum, qui ne contient pas le nom du compte), QR code TOTP, dix codes de secours affichés une seule fois. La session admin dure 12 heures et expire après 30 minutes sans activité. Les actions sensibles (régénérer un code, supprimer un groupe) redemandent un code TOTP.

## Variables d’environnement

| Variable | Rôle |
| --- | --- |
| `DB_PASSWORD` | Mot de passe Postgres. Le défaut du fichier compose est un secret de développement. |
| `PIN_PEPPER` | Au moins 32 caractères. Entre dans le HMAC du code PIN avant argon2id. |
| `TOTP_KEY` | 64 caractères hexadécimaux. Chiffre le secret TOTP (AES-256-GCM). |
| `ORIGIN` | URL publique, par exemple `https://cadeaux.exemple.be`. Les cookies `Secure` et le contrôle d’origine s’appuient dessus. |
| `ADMIN_PATH` | Chemin du tableau de bord, défaut `/gestion`. À changer avant d’exposer le site. |
| `SETUP_TOKEN` | Code de première installation. Vide : généré et journalisé. |
| `XFF_DEPTH` | Nombre de proxies de confiance, en partant de la droite de `X-Forwarded-For`. `1` pour un seul reverse proxy. |
| `ADDRESS_HEADER` | En-tête lu par l’application (défaut `x-forwarded-for`). |
| `PROTOCOL_HEADER` / `HOST_HEADER` | Repris par l’adaptateur si `ORIGIN` n’est pas défini. Avec `ORIGIN`, ils ne changent pas l’adresse vue par l’application. |

Si `ORIGIN` commence par `https://` et que `PIN_PEPPER`, `TOTP_KEY` ou le mot de passe de la base sont encore les valeurs de développement, le conteneur refuse de démarrer.

L’application ne définit pas la variable SvelteKit `ADDRESS_HEADER`. Sans l’en-tête, SvelteKit ferait échouer le healthcheck et l’accès direct. L’adresse du visiteur est lue dans `X-Forwarded-For` ; à défaut, c’est l’adresse TCP.

## Reverse proxy

Le conteneur n’écoute que sur la boucle locale de l’hôte (`127.0.0.1:3080`). Le proxy termine TLS et transmet la requête. Il doit envoyer l’adresse réelle du visiteur, le protocole et l’hôte, et **remplacer** `X-Forwarded-For` plutôt que d’y ajouter une valeur fournie par le client.

### Nginx Proxy Manager

Proxy Host vers `127.0.0.1:3080`, schéma HTTP, certificats Let’s Encrypt. Dans l’onglet Advanced :

```nginx
proxy_set_header Host $host;
proxy_set_header X-Forwarded-Host $host;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header X-Real-IP $remote_addr;
client_max_body_size 2m;
```

`XFF_DEPTH=1`.

### DSM (Synology)

Dans Portail de connexion → Avancé → Proxy inverse : source HTTPS, nom de domaine public, destination HTTP `localhost` port `3080`. En-têtes personnalisés :

- `X-Forwarded-Proto` = `$scheme` (ou `https`)
- `X-Forwarded-For` = `$remote_addr`

### Traefik

```yaml
http:
  routers:
    souhaits:
      rule: Host(`cadeaux.exemple.be`)
      entryPoints: [websecure]
      tls:
        certResolver: letsencrypt
      service: souhaits
  services:
    souhaits:
      loadBalancer:
        servers:
          - url: http://127.0.0.1:3080
```

Traefik ajoute `X-Forwarded-For` et `X-Forwarded-Proto`. Avec un seul saut, laissez `XFF_DEPTH=1`.

## Synology, QNAP, Portainer

1. Copiez ce dossier vers un volume, par exemple `/volume1/docker/nos-souhaits`.
2. Créez `.env` à partir de `.env.example` et changez les secrets (`openssl rand -base64 48` pour le poivre, `openssl rand -hex 32` pour `TOTP_KEY`).
3. Container Manager (Synology) ou Container Station (QNAP) : projet « Créer » à partir de `compose.yaml`. Portainer : Stacks → Add stack, collez le compose et les variables.
4. Les images `postgres:17-alpine` et `prodrigestivill/postgres-backup-local:17` sont multi-architectures. L’image de l’application se construit sur le NAS (`docker compose build`) : le Dockerfile part de `node:24-alpine`, donc amd64 et arm64.
5. Le workflow `.github/workflows/image.yml` construit et pousse `linux/amd64` + `linux/arm64` vers GHCR lors d’un tag `v*`. Si le dépôt n’est pas sur GitHub, construisez sur le NAS ou avec `docker buildx build --platform linux/amd64,linux/arm64`.

Mémoire prévue : 384 Mo pour l’application, 512 Mo pour Postgres, 128 Mo pour la sauvegarde. Postgres est réglé pour un petit NAS (`shared_buffers=128MB`, `max_connections=20`).

## Sauvegardes et restauration

Le conteneur `backup` lance `pg_dump` au démarrage puis chaque nuit à 3 h (fuseau `Europe/Brussels`). Conservation : 7 jours, 4 semaines, 6 mois. Les fichiers `.sql.gz` sont dans `./backups`. L’admin les voit sous Sauvegardes ; une copie de plus de 36 heures est signalée.

Ne copiez pas `data/postgres` à chaud. Copiez `backups/` et, plus tard, `data/uploads`.

Restaurer un dump dans une base vide (le conteneur `db` doit tourner) :

```bash
docker compose stop app
gunzip -c backups/daily/wishlist-latest.sql.gz | docker compose exec -T db psql -U wishlist -d wishlist
docker compose start app
```

Les copies sont rangées dans `backups/daily`, `backups/weekly`, `backups/monthly` et `backups/last` (fichiers `wishlist-….sql.gz`). Après une restauration, les sessions et les codes PIN sont ceux du dump.

## Connexion des membres

L’admin crée un groupe, ajoute un membre (prénom affiché, lien de parenté) et reçoit un code à six chiffres **une seule fois**. Le code est stocké sous forme argon2id d’un HMAC-SHA256 (poivre serveur). Il ne peut pas être réaffiché : seulement régénéré, ce qui coupe les sessions du membre.

Le membre choisit son prénom (mémorisé sur l’appareil, pas dans un annuaire public) puis son code. Un prénom inconnu et un code faux donnent le même message. Cinq échecs verrouillent le compte 15 minutes, puis 1 heure, puis 6 heures, puis jusqu’à déblocage par l’admin. Dix échecs depuis la même adresse suivent une échelle proche. Au-delà de 200 échecs dans l’heure, les nouvelles connexions par code sont suspendues une heure ; les sessions déjà ouvertes continuent. La session membre dure environ 180 jours et se prolonge à l’usage. Cookie `httpOnly` : `__Host-session` en HTTPS, `ns_session` en HTTP.

Le propriétaire d’un souhait ne reçoit aucune information de réservation (option A) : pas de « déjà pris », pas de nom. Les autres membres voient seulement « Déjà pris ». La personne qui a réservé peut annuler ou marquer le cadeau comme acheté. L’administrateur voit qui a pris quoi, sur la fiche du groupe et dans Listes. Ces règles sont dans les objets renvoyés à la page et à `GET /listes/<id>/json`, et dans les triggers SQL.

N’importe quel membre du groupe crée une liste (nom, thème Noël, Saint-Nicolas, Anniversaire ou Autre, date facultative, personne concernée facultative). Si une personne est indiquée, elle seule y dépose des souhaits. Sinon chacun ajoute les siens. L’administrateur modifie et archive toutes les listes.

Un souhait porte un titre, un lien facultatif, une photo facultative, une priorité de 1 à 3, une description et la case « surprenez-moi ». Cette case désigne une idée vague, sans objet précis : le lien reste facultatif et la carte s’affiche comme un cadeau mystère. « Lire le lien » tente un aperçu (titre et image) : http ou https seulement, ports 80 et 443, DNS revérifié à chaque redirection (3 au plus), adresses privées et locales refusées, 5 secondes, 1 Mo, sans cookie. L’image est recopiée sur le volume, jamais affichée depuis le site d’origine. Un double clic sur Enregistrer ne crée pas le souhait deux fois : le bouton se verrouille le temps de l’envoi, et le serveur reconnaît le même formulaire.

Les photos déposées (10 Mo, JPEG, PNG, WebP, HEIC) sont réencodées en WebP (1 200 px et miniature), sans données EXIF, dans `data/uploads`. Elles ne sont servies qu’aux membres du groupe.

## Développement

```bash
npm install
npm run check
npm test
npm run dev
```

Les tests d’intégration attendent Postgres sur `127.0.0.1:54329` (`DATABASE_URL` peut surcharger) :

```bash
docker run -d --name ns-test-pg \
  -e POSTGRES_PASSWORD=wishlist-dev-password \
  -e POSTGRES_USER=wishlist -e POSTGRES_DB=wishlist \
  -p 127.0.0.1:54329:5432 postgres:17-alpine
npm test
```

`LOGIN_DELAY_SCALE=0` est posé par les tests pour ne pas attendre le délai anti-bruteforce.

## Ce qui n’est pas dans cette version

- Cadeaux communs (cagnottes) et notifications Web Push.
- Prix, sauf les montants de cagnotte prévus plus tard.

Questions encore ouvertes : modèle exact du NAS, nom de domaine et proxy retenus, restriction de l’admin à l’adresse de la maison, fail2ban ou CrowdSec devant le proxy.
