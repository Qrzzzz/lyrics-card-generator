<div align="center">

# 🎧 Lyrics Card Generator

### Générez des cartes de paroles soignées prêtes à partager

**Spotify / Apple Music / NetEase Cloud Music / QQ Music · application de bureau Windows · export PNG / WebP / JPG haute résolution · documentation multilingue**

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
  <a href="./docs/releases/v6.0.0.fr.md">Notes de version</a> ·
  <a href="https://qrzzzz.github.io/lyrics-card-generator/">Web Lite en ligne</a> ·
  <a href="#fonctionnalités-principales">Fonctionnalités principales</a> ·
  <a href="./docs/development.en.md">Développement local</a> ·
  <a href="./LICENSE">Licence</a>
</p>

![Platform](https://img.shields.io/badge/Platform-Windows%20Desktop-111827)
![Stack](https://img.shields.io/badge/Stack-Next.js%20%2B%20React%20%2B%20TypeScript-0F766E)
![Desktop](https://img.shields.io/badge/Desktop-Electron-1D4ED8)
![Output](https://img.shields.io/badge/Output-PNG%20%2F%20WebP%20%2F%20JPG-FF5722)
![Docs](https://img.shields.io/badge/Docs-6%20Languages-7C3AED)
![Release](https://img.shields.io/github/v/release/Qrzzzz/lyrics-card-generator?include_prereleases)

</div>

---

<details>
<summary><strong>🖥️ Interface de l’application</strong></summary>

<table>
  <tr>
    <td align="center" valign="top"><img src="./docs/readme-assets/screenshots/step-3.fr.webp" alt="Réglages de mise en page à l’étape 3 et aperçu en direct de la carte dans l’interface française" width="100%" /><br/><sub><b>Étape 3 : Mise en page · Couleurs dynamiques extraites de la pochette</b></sub></td>
  </tr>
</table>

</details>

<details>
<summary><strong>✨ Exemples de rendu</strong></summary>

<table>
  <tr>
    <td width="50%" align="center" valign="top"><sub><b>Sans traduction · Français</b></sub><br/><img src="./docs/readme-assets/cards/fr.single.webp" alt="Carte de paroles en français sans traduction" width="100%" /></td>
    <td width="50%" align="center" valign="top"><sub><b>Avec traduction · Texte anglais + traduction française</b></sub><br/><img src="./docs/readme-assets/cards/fr.bilingual.webp" alt="Carte de paroles en anglais avec traduction française" width="100%" /></td>
  </tr>
</table>

Les deux images ont été exportées directement depuis l’application, avec largeur et hauteur automatiques et un interligne de 1,7.

</details>

<img
  align="right"
  src="./public/app-icon.png"
  alt="Lyrics Card Generator icon"
  width="200"
/>

Une application Windows pour créer des cartes de paroles.
Collez un lien de morceau ou saisissez les informations manuellement, modifiez les paroles, traductions, pochettes et styles visuels, puis exportez une image PNG, WebP ou JPG haute résolution.

## 📦 Téléchargement et installation

Téléchargez la v6.0.0 depuis [GitHub Releases](https://github.com/Qrzzzz/lyrics-card-generator/releases/latest) :

* Installateur : `Lyrics Card Generator Setup 6.0.0.exe`
* Version portable : `Lyrics Card Generator-6.0.0-portable.exe`

L'installateur est recommandé pour une utilisation régulière. La version portable convient aux essais, à une utilisation temporaire ou à un disque amovible.

> La version actuelle n'est pas signée. Windows peut afficher un avertissement SmartScreen, ce qui est courant pour une application personnelle non signée.

### Points forts de la v6.0.0

* Le pipeline des paroles repose désormais sur `LyricDocumentV2`, avec des identifiants Block et Unit stables et des révisions de document, sans modifier l’éditeur texte habituel.
* Importation, édition, traduction, historique, aperçu, mise en page et export utilisent un document unique ; les anciennes chaînes ne sont plus que des projections de compatibilité.
* La traduction IA renvoie des résultats structurés adressés par Unit ID et vérifie la révision pour éviter les décalages et les réponses tardives.

## 🌐 Notes de publication multilingues

Par défaut, GitHub Release affiche un résumé en chinois simplifié. Consultez les notes complètes :
[简体中文](./docs/releases/v6.0.0.zh-CN.md) · [繁體中文](./docs/releases/v6.0.0.zh-TW.md) · [English](./docs/releases/v6.0.0.en.md) · [Français](./docs/releases/v6.0.0.fr.md) · [日本語](./docs/releases/v6.0.0.ja.md) · [Español](./docs/releases/v6.0.0.es.md)

<a id="fonctionnalités-principales"></a>

## ✨ Fonctionnalités principales

### 🎨 Génération d'images et mise en page

* Génération d'images de paroles très soignées
* Modes de taille portrait et cartes paysage à ratio libre, avec largeur de zone de paroles et hauteur demandée automatiques ou manuelles
* Planification paysage guidée par le contenu pour la colonne pochette/métadonnées et la colonne de paroles, sans recadrer les paroles ni la pochette
* Largeur et hauteur automatiques mesurées pour les toiles portrait personnalisées
* Export PNG, WebP et JPG haute résolution

### 📝 Mise en page et traduction des paroles

* Mise en page originale des paroles et des traductions
* Conservation d’une sélection exacte dans l’une ou l’autre colonne, avec annulation et rétablissement
* Séparation automatique des lignes original / traduction avec détection du chinois simplifié, chinois traditionnel, anglais, français, japonais et espagnol
* Traduction de paroles par IA via les API Chat Completions compatibles OpenAI, avec URL du fournisseur, modèle, clé API, six préréglages par défaut, deux préréglages personnalisés, Reasoning et sortie en streaming configurables

### 🎵 Recherche de morceau, liens musicaux et analyse de fichiers locaux

* Recherche NetEase Cloud Music par titre, artiste ou album, puis import des métadonnées et paroles du résultat choisi
* Analyse de liens Spotify, Apple Music, NetEase Cloud Music et QQ Music
* Analyse de métadonnées MP3 / FLAC / M4A locales : titre, artiste, album, pochette et paroles intégrées

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

### 🪟 Version Windows

* Electron encapsule l’interface Next.js et l’API locale ; l’EXE lance le service embarqué sur un port dynamique de `127.0.0.1`, sans installation de Node.js pour l’utilisateur
* Le démarrage hors ligne couvre l’édition manuelle, les pochettes locales, l’analyse MP3 / FLAC / M4A locale, les styles et l’export PNG / WebP / JPG
* Les liens musicaux, la recherche NetEase Cloud Music, les pochettes et paroles distantes, la traduction IA et la vérification GitHub nécessitent une connexion
* Les mainteneurs peuvent consulter le [guide de maintenance bureau](./docs/desktop.md) et le [guide de développement en anglais](./docs/development.en.md)

## 🙏 Remerciements

Merci à [Apple Music](https://music.apple.com/). Les dégradés colorés, l’esthétique des arrière-plans lumineux et fluides, ainsi que les premières orientations de mise en page des cartes de paroles de ce projet ont été inspirés par l’expérience visuelle d’Apple Music. Ce projet n’est pas affilié à Apple Music et ne représente pas la position officielle d’Apple Music.

Merci à [Source Han Sans](https://github.com/adobe-fonts/source-han-sans) et [Source Han Serif](https://github.com/adobe-fonts/source-han-serif). Elles fournissent une base typographique stable, claire et solide pour les cartes de paroles en chinois.

Merci à [OpenAI Codex](https://openai.com/codex/). Il a transformé de nombreuses idées éparses en code exécutable, en workflows de build desktop et en fonctionnalités réelles.

Merci à [ChatGPT 5.6 Sol](https://chatgpt.com/) pour le diagnostic des problèmes, la conception de solutions, la relecture des correctifs et les vérifications d’acceptation pendant le développement.

Merci à [ReactBits](https://www.reactbits.dev/) pour ses nombreuses idées d’interface, notamment des inspirations d’animation comme Spark Cursor.

Merci à [Rangerov](https://github.com/rangerov0716) pour l’attention portée à ce projet et pour ses retours.

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
| 《honeybee》 | *you seem pretty sad for a girl so in love* | [Olivia Rodrigo](https://www.oliviarodrigo.com/) |
| 《Lies》 | *Always - EP* | [BIGBANG](https://ygfamily.com/en/artists/bigbang/discography) |

</details>

Merci également à ces projets open source et à leurs mainteneurs : [Next.js](https://nextjs.org/), [React](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Tailwind CSS](https://tailwindcss.com/), [Electron](https://www.electronjs.org/), [electron-builder](https://www.electron.build/), [html-to-image](https://github.com/bubkoo/html-to-image), [Framer Motion](https://motion.dev/), [Lucide React](https://lucide.dev/), [Cheerio](https://cheerio.js.org/), [Zod](https://zod.dev/), ainsi qu’aux nombreuses chaînes d’outils qui composent l’écosystème frontend moderne. Sans ces infrastructures, ce projet n’aurait pas sa forme actuelle.

## 📄 Licence

Ce projet est publié sous une licence Source Available personnalisée, et non sous une licence open-source traditionnelle.

Vous pouvez consulter, télécharger, exécuter et modifier en privé le code source à des fins personnelles, non commerciales, éducatives et d'évaluation. L'utilisation commerciale, la redistribution, le repackaging, les versions modifiées publiques et les produits concurrents basés sur ce projet nécessitent une autorisation écrite préalable du détenteur des droits.

Les dépendances open-source tierces restent régies par leurs licences respectives. Consultez [LICENSE](./LICENSE) pour plus de détails.
