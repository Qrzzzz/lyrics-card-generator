<div align="center">

# 🎧 Lyrics Card Generator

### Générez des cartes de paroles soignées prêtes à partager

**Spotify / Apple Music / NetEase Cloud Music / QQ Music · application de bureau Windows · export PNG haute résolution · documentation multilingue**

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
  <a href="./docs/releases/v4.3.6.fr.md">Notes de version</a> ·
  <a href="https://qrzzzz.github.io/lyrics-card-generator/">Web Lite en ligne</a> ·
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

<img
  align="right"
  src="./public/app-icon.png"
  alt="Lyrics Card Generator icon"
  width="200"
/>

Une application Windows pour générer des cartes de paroles élégantes.
Collez un lien de morceau ou saisissez les informations manuellement, modifiez les paroles, traductions, pochettes et styles visuels, puis exportez une image PNG haute résolution.

## 📦 Téléchargement et installation

Téléchargez la dernière version depuis [GitHub Releases](https://github.com/Qrzzzz/lyrics-card-generator/releases/latest) :

* Installateur recommandé : `Lyrics Card Generator Setup 4.3.6.exe`
* Version portable : `Lyrics Card Generator-4.3.6-portable.exe`

L'installateur est recommandé pour une utilisation régulière. La version portable convient aux essais, à une utilisation temporaire ou à un disque amovible.

> La version actuelle n'est pas signée. Windows peut afficher un avertissement SmartScreen, ce qui est courant pour une application personnelle non signée.

### Points clés de la v4.3.6

* L’en-tête principal fait désormais partie du flux de contenu de l’éditeur au lieu de flotter au-dessus des étapes et de l’aperçu ; la surface des exemples réutilise toujours le même en-tête en bas comme entrée de retour.
* La surface des exemples supprime l’effet de cadre extérieur, affiche la langue de traduction une seule fois à côté du titre et ajoute un interrupteur Importer la traduction activé par défaut.
* Quand Importer la traduction est activé, charger un exemple écrit la traduction et active l’interrupteur de traduction de l’éditeur principal ; quand il est désactivé, seules les informations de chanson et les paroles sont importées.
* Les imports croisés chinois simplifié / chinois traditionnel n’activent plus la traduction par défaut, le bouton X inférieur reçoit un retour orange-rouge au survol, et le fantôme de transition de l’en-tête est corrigé.
* Les libellés de qualité d’export deviennent Standard / Haute / Ultra, tandis que les ratios réels restent 1x / 1,4x / 2x.

<br clear="right" />

## 🌐 Notes de publication multilingues

La page GitHub Release utilise par défaut la version courte en chinois simplifié, les notes de publication complètes sont conservées dans `docs/releases/` :

* [简体中文](./docs/releases/v4.3.6.zh-CN.md)
* [繁體中文](./docs/releases/v4.3.6.zh-TW.md)
* [English](./docs/releases/v4.3.6.en.md)
* [Français](./docs/releases/v4.3.6.fr.md)
* [日本語](./docs/releases/v4.3.6.ja.md)
* [Español](./docs/releases/v4.3.6.es.md)

<a id="fonctionnalités-principales"></a>

## ✨ Fonctionnalités principales

### 🎨 Génération d'images et mise en page

* Génération d'images de paroles très soignées
* Formats portrait, paysage et dimensions de toile personnalisées
* Mise en page paysage reconstruite autour des zones sûres, de la colonne de pochette, de la colonne de contenu et du pied de page
* Hauteur automatique mesurée pour les toiles portrait personnalisées
* Export PNG haute résolution

### 📝 Mise en page et traduction des paroles

* Mise en page originale des paroles et des traductions
* Séparation automatique des lignes original / traduction avec détection du chinois simplifié, chinois traditionnel, anglais, français, japonais et espagnol
* Traduction de paroles par IA via les API Chat Completions compatibles OpenAI, avec URL du fournisseur, modèle, clé API, six styles, Reasoning et sortie en streaming configurables

### 🎵 Recherche de morceau, liens musicaux et analyse de fichiers locaux

* Recherche NetEase Cloud Music par titre, artiste ou album, puis import des métadonnées et paroles du résultat choisi
* Analyse de liens Spotify, Apple Music, NetEase Cloud Music et QQ Music
* Analyse de métadonnées MP3 / FLAC locales : titre, artiste, album, pochette et paroles intégrées

### ✍️ Édition manuelle et import de matériel

* Édition manuelle du titre, de l'artiste, de la pochette et des paroles
* Import de pochette locale

### 🌈 Style visuel et informations de marque

* Extraction de palette depuis la pochette pour créer des fonds en dégradé
* Modes d’apparence de l’interface : Dynamique de l’album, sombre, clair, Acrylique sombre et Acrylique clair
* Logo de plateforme, texte de partage et filigrane généré

### 🔤 Polices et interface multilingue

* Jeux Source Han Sans / Serif, polices CJK et latines indépendantes, sélecteur de polices système et aperçu avec de vraies paroles
* Interface en chinois simplifié, chinois traditionnel, anglais, français, japonais et espagnol

### 🚀 Mises à jour

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
* Recherche NetEase Cloud Music et récupération de paroles
* Chargement de pochettes distantes
* Récupération automatique des paroles
* Traduction de paroles par IA
* Vérification des mises à jour via GitHub Releases

## 🚀 Utilisation

1. Lancez l'application.
2. Recherchez NetEase Cloud Music par titre, artiste ou album, puis choisissez un résultat pour importer les métadonnées, la pochette et les paroles.
3. Vous pouvez aussi coller un lien Spotify, Apple Music, NetEase Cloud Music ou QQ Music, ou importer un fichier local MP3 / FLAC.
4. Modifiez les paroles et traductions ; utilisez la traduction IA ou séparez automatiquement les lignes original / traduction selon la langue de l'interface.
5. Ajustez le ratio de toile, les jeux de polices CJK / latines, les couleurs, cadres, filigranes et autres styles.
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

La version 3.1.0 propose les jeux Source Han Sans et Source Han Serif et permet de choisir séparément les polices CJK et latines. Les polices disposent désormais d’une étape dédiée, au même niveau que les paroles, la mise en page et les détails visuels. L'application de bureau peut énumérer les polices système Windows ; les builds Web conservent les polices recommandées et les préréglages intégrés. L'aperçu complet se trouve sous la vraie carte dans la colonne de droite et utilise le même algorithme de fond avec les couleurs fixes Bleu abyssal, Cobalt, Indigo et Bleu nocturne ; il ne modifie pas le fond réel de la carte et n'entre pas dans le PNG exporté.

## 🙏 Remerciements

Merci à [Apple Music](https://music.apple.com/). Les dégradés colorés, l’esthétique des arrière-plans lumineux et fluides, ainsi que les premières orientations de mise en page des cartes de paroles de ce projet ont été inspirés par l’expérience visuelle d’Apple Music. Ce projet n’est pas affilié à Apple Music et ne représente pas la position officielle d’Apple Music.

Merci à [Source Han Sans](https://github.com/adobe-fonts/source-han-sans) et [Source Han Serif](https://github.com/adobe-fonts/source-han-serif). Elles fournissent une base typographique stable, claire et solide pour les cartes de paroles en chinois.

Merci à [OpenAI Codex](https://openai.com/codex/). Il a transformé de nombreuses idées éparses en code exécutable, en workflows de build desktop et en fonctionnalités réelles.

Merci à [ChatGPT 5.5](https://chatgpt.com/) pour le diagnostic des problèmes, la conception de solutions, la relecture des correctifs et les vérifications d’acceptation pendant le développement.

Merci à [ReactBits](https://www.reactbits.dev/) pour ses nombreuses idées d’interface, notamment des inspirations d’animation comme Spark Cursor.

Merci à Rangerov pour l’attention portée à ce projet et pour ses retours.

Merci à [V0idream](https://github.com/V0idream) pour ses suggestions d’allègement du code. [`v1.1.0`](https://github.com/Qrzzzz/lyrics-card-generator/releases/tag/v1.1.0) a déjà été optimisée en conséquence.


Merci aux chansons suivantes et à leurs créateurs. Elles servent d’exemples pour le projet, aidant à vérifier l’affichage des cartes de paroles dans différentes langues, polices, longueurs de traduction et rythmes de mise en page.

<details>
<summary>Déplier pour voir les exemples de chansons</summary>

| Chanson | Album | Artiste |
| --- | --- | --- |
| 《opposite》 | *emails i can't send fwd:* | [Sabrina Carpenter](https://www.sabrinacarpenter.com/) |
| 《勇者》 | *THE BOOK 3* | [YOASOBI](https://www.yoasobi-music.jp/) |
| 《光辉岁月》 | *命运派对* | [Beyond](https://music.apple.com/cn/artist/beyond/79668659) |
| 《Opalite》 | *The Life of a Showgirl* | [Taylor Swift](https://www.taylorswift.com/) |

</details>

Merci également à ces projets open source et à leurs mainteneurs : [Next.js](https://nextjs.org/), [React](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Tailwind CSS](https://tailwindcss.com/), [Electron](https://www.electronjs.org/), [electron-builder](https://www.electron.build/), [html-to-image](https://github.com/bubkoo/html-to-image), [Framer Motion](https://motion.dev/), [Lucide React](https://lucide.dev/), [Cheerio](https://cheerio.js.org/), [Zod](https://zod.dev/), ainsi qu’aux nombreuses chaînes d’outils qui composent l’écosystème frontend moderne. Sans ces infrastructures, ce projet n’aurait pas sa forme actuelle.

## 📄 Licence

Ce projet est publié sous une licence Source Available personnalisée, et non sous une licence open-source traditionnelle.

Vous pouvez consulter, télécharger, exécuter et modifier en privé le code source à des fins personnelles, non commerciales, éducatives et d'évaluation. L'utilisation commerciale, la redistribution, le repackaging, les versions modifiées publiques et les produits concurrents basés sur ce projet nécessitent une autorisation écrite préalable du détenteur des droits.

Les dépendances open-source tierces restent régies par leurs licences respectives. Consultez [LICENSE](./LICENSE) pour plus de détails.
