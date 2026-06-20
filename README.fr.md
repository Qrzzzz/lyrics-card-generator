<div align="center">

# 🎧 Lyrics Card Generator

### Générez des cartes de paroles soignées prêtes à partager

**Apple Music / NetEase Cloud Music / QQ Music · application de bureau Windows · export PNG haute résolution · documentation multilingue**

<p>
  <strong>Langue</strong><br/>
  <a href="./README.md">简体中文</a> ·
  <a href="./README.zh-TW.md">繁體中文</a> ·
  <a href="./README.en.md">English</a> ·
  <strong>Français</strong> ·
  <a href="./README.ja.md">日本語</a> ·
  <a href="./README.es.md">Español</a>
</p>

<p>
  <strong>Navigation</strong><br/>
  <a href="https://github.com/Qrzzzz/lyrics-card-generator/releases/latest">Télécharger la dernière version</a> ·
  <a href="./docs/releases/v3.0.0.fr.md">Notes de version</a> ·
  <a href="#fonctionnalités-principales">Fonctionnalités principales</a> ·
  <a href="#développement-local">Développement local</a> ·
  <a href="./LICENSE">Licence</a>
</p>

![Platform](https://img.shields.io/badge/Platform-Windows%20Desktop-111827)
![Stack](https://img.shields.io/badge/Stack-Next.js%20%2B%20React%20%2B%20TypeScript-0F766E)
![Desktop](https://img.shields.io/badge/Desktop-Electron-1D4ED8)
![Output](https://img.shields.io/badge/Output-PNG-FF5722)
![Docs](https://img.shields.io/badge/Docs-6%20Languages-7C3AED)
![Release](https://img.shields.io/github/v/release/Qrzzzz/lyrics-card-generator?include_prereleases)

</div>

---

Une application Windows pour générer des cartes de paroles élégantes.
Collez un lien de morceau ou saisissez les informations manuellement, modifiez les paroles, traductions, pochettes et styles visuels, puis exportez une image PNG haute résolution.

## 📦 Téléchargement et installation

Téléchargez la dernière version depuis [GitHub Releases](https://github.com/Qrzzzz/lyrics-card-generator/releases/latest) :

* Installateur recommandé : `Lyrics Card Generator Setup 3.0.0.exe`
* Version portable : `Lyrics Card Generator-3.0.0-portable.exe`

L'installateur est recommandé pour une utilisation régulière. La version portable convient aux essais, à une utilisation temporaire ou à un disque amovible.

> La version actuelle n'est pas signée. Windows peut afficher un avertissement SmartScreen, ce qui est courant pour une application personnelle non signée.

## 🌐 Notes de publication multilingues

La page GitHub Release utilise par défaut une version courte en français. Les notes de publication complètes sont maintenues dans `docs/releases/` :

* [简体中文](./docs/releases/v3.0.0.zh-CN.md)
* [繁體中文](./docs/releases/v3.0.0.zh-TW.md)
* [English](./docs/releases/v3.0.0.en.md)
* [Français](./docs/releases/v3.0.0.fr.md)
* [日本語](./docs/releases/v3.0.0.ja.md)
* [Español](./docs/releases/v3.0.0.es.md)

<a id="fonctionnalités-principales"></a>

## ✨ Fonctionnalités principales

* Génération d'images de paroles très soignées
* Formats portrait, paysage et dimensions de toile personnalisées
* Mise en page paysage reconstruite autour des zones sûres, de la colonne de pochette, de la colonne de contenu et du pied de page
* Hauteur automatique mesurée pour les toiles portrait personnalisées
* Mise en page originale des paroles et des traductions
* Séparation automatique des lignes original / traduction avec détection du chinois simplifié, chinois traditionnel, anglais, français, japonais et espagnol
* Traduction de paroles par IA via les API Chat Completions compatibles OpenAI, avec URL du fournisseur, modèle, clé API, six styles, Reasoning et sortie en streaming configurables
* Analyse de liens Apple Music, NetEase Cloud Music et QQ Music
* Analyse de métadonnées MP3 / FLAC locales : titre, artiste, album, pochette et paroles intégrées
* Édition manuelle du titre, de l'artiste, de la pochette et des paroles
* Import de pochette locale
* Extraction de palette depuis la pochette pour créer des fonds en dégradé
* Logo de plateforme, texte de partage et filigrane généré
* Réglages de cadre, ombre, police, polices système Windows, taille, interligne et couleur du texte
* Interface en chinois simplifié, chinois traditionnel, anglais, français, japonais et espagnol
* Export PNG haute résolution
* Vérification des mises à jour via GitHub Releases

## 🪟 Version Windows

La version de bureau conserve l'interface Web Next.js et les routes API, puis les emballe avec Electron.

Au lancement de l'EXE, l'application démarre un service Next local sur la machine et l'ouvre dans une fenêtre de bureau. Les utilisateurs n'ont pas besoin de connaître Node.js, npm ou les serveurs de développement locaux.

L'application peut démarrer hors ligne. Les fonctions suivantes restent disponibles sans connexion :

* Édition manuelle des informations du morceau
* Édition manuelle des paroles et traductions
* Import de pochette locale
* Analyse des métadonnées et paroles intégrées de fichiers MP3 / FLAC
* Personnalisation visuelle
* Génération et export PNG

Ces fonctions nécessitent Internet :

* Analyse de liens de plateformes musicales
* Chargement de pochettes distantes
* Récupération automatique des paroles
* Traduction de paroles par IA
* Vérification des mises à jour via GitHub Releases

## 🚀 Utilisation

1. Lancez l'application.
2. Collez un lien Apple Music, NetEase Cloud Music ou QQ Music, ou saisissez les informations du morceau manuellement.
3. Vous pouvez aussi importer un fichier local MP3 / FLAC pour lire les métadonnées, la pochette et les paroles intégrées.
4. Modifiez les paroles et traductions ; utilisez la traduction IA ou séparez automatiquement les lignes original / traduction selon la langue de l'interface.
5. Ajustez le ratio de toile, les polices, les polices système Windows, les couleurs, cadres, filigranes et autres styles.
6. Prévisualisez la carte à droite.
7. Utilisez « Terminer et exporter » pour enregistrer l'image PNG.

## 🔄 Vérification des mises à jour

L'application propose un bouton « Vérifier les mises à jour ».
Il interroge les GitHub Releases du projet via une route API locale Next, compare la version actuelle avec la dernière version publiée et privilégie les assets installateur / portable lorsqu'ils sont disponibles.

Cette fonction vérifie seulement les mises à jour et ouvre la page de téléchargement. Elle ne télécharge pas silencieusement d'installateur et ne remplace pas automatiquement l'application actuelle.

<a id="développement-local"></a>

## 🛠️ Développement local

Node.js et npm sont requis.

```bash
npm install
npm run dev
```

Puis ouvrez :

```text
http://localhost:3000
```

## 🖥️ Développement bureau et packaging

Lancez l'application de bureau en mode développement :

```bash
npm run desktop:dev
```

Construisez un dossier de bureau unpacked pour inspection :

```bash
npm run desktop:pack
```

Construisez l'installateur Windows et l'EXE portable :

```bash
npm run desktop:build
```

Les artefacts de build sont écrits dans :

```text
release/
```

Le service Next standalone empaqueté est préparé dans :

```text
dist-desktop/server
```

## 📜 Scripts

```bash
npm run dev             # Démarre le serveur de développement Web
npm run build           # Compile l'application Next.js
npm run typecheck       # Lance la vérification TypeScript
npm run desktop:dev     # Démarre le mode développement Electron
npm run desktop:pack    # Construit un dossier de bureau unpacked
npm run desktop:build   # Construit l'installateur Windows et l'EXE portable
npm run parse:test      # Teste l'analyse des liens de chansons
npm run core:test       # Teste les fonctions pures du noyau 3.0
```

## 🧩 Stack technique

* Next.js
* React
* TypeScript
* Tailwind CSS
* Electron
* electron-builder
* html-to-image
* Framer Motion
* Lucide React
* Cheerio
* Zod
* Inspirations UI de ReactBits

## 🔤 Polices

Le projet utilise :

* Source Han Sans
* Source Han Serif

Elles fournissent une base typographique solide, claire et fiable pour les cartes de paroles en chinois.

L'application de bureau 3.0.0 peut aussi énumérer les polices système Windows pour une typographie personnalisée. Les builds Web ne peuvent pas énumérer les polices système, mais les préréglages existants restent disponibles.

## 🙏 Remerciements

Merci à [Apple Music](https://music.apple.com/). L'arrière-plan en dégradé coloré, l'atmosphère visuelle fluide et les premières orientations de mise en page des cartes de paroles ont été inspirés par l'expérience visuelle d'Apple Music. Ce projet n'est pas affilié à Apple Music et ne représente pas sa position officielle.

Merci à [Source Han Sans](https://github.com/adobe-fonts/source-han-sans) et [Source Han Serif](https://github.com/adobe-fonts/source-han-serif). Elles fournissent la base typographique solide et lisible utilisée par les cartes de paroles.

Merci à « opposite » de [Sabrina Carpenter](https://www.sabrinacarpenter.com/). Le morceau sert d'exemple au démarrage et a aidé à façonner le premier rythme de mise en page pour les paroles anglaises et les traductions chinoises. Tous les droits de l'œuvre musicale appartiennent à leurs détenteurs respectifs. Ce projet ne distribue aucun contenu audio.

Merci à [OpenAI Codex](https://openai.com/codex/) pour avoir transformé de nombreuses idées en code fonctionnel, workflows de packaging desktop et fonctionnalités produit réelles.

Merci à [ChatGPT 5.5](https://chatgpt.com/) pour le diagnostic des problèmes, la conception de solutions, la revue des correctifs et les vérifications d'acceptation tout au long du développement.

Merci à [ReactBits](https://www.reactbits.dev/) pour plusieurs idées d'interface, dont Spark Cursor et d'autres inspirations de motion design.

Merci à Rangerov pour l'attention portée à ce projet et pour ses retours.

Merci à [Sakuramble](https://github.com/Sakuramble) pour ses suggestions de réduction de code. Les optimisations correspondantes ont été mises en œuvre dans [`v1.1.0`](https://github.com/Qrzzzz/lyrics-card-generator/releases/tag/v1.1.0).

Merci également aux mainteneurs de [Next.js](https://nextjs.org/), [React](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Tailwind CSS](https://tailwindcss.com/), [Electron](https://www.electronjs.org/), [electron-builder](https://www.electron.build/), [html-to-image](https://github.com/bubkoo/html-to-image), [Framer Motion](https://motion.dev/), [Lucide React](https://lucide.dev/), [Cheerio](https://cheerio.js.org/), [Zod](https://zod.dev/) et l'écosystème frontend moderne au sens large. Sans ces fondations open-source, ce projet n'existerait pas sous sa forme actuelle.

## 📄 Licence

Ce projet est publié sous une licence Source Available personnalisée, et non sous une licence open-source traditionnelle.

Vous pouvez consulter, télécharger, exécuter et modifier en privé le code source à des fins personnelles, non commerciales, éducatives et d'évaluation. L'utilisation commerciale, la redistribution, le repackaging, les versions modifiées publiques et les produits concurrents basés sur ce projet nécessitent une autorisation écrite préalable du détenteur des droits.

Les dépendances open-source tierces restent régies par leurs licences respectives. Consultez [LICENSE](./LICENSE) pour plus de détails.
