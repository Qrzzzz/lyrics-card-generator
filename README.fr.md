<div align="center">

# 🎧 Lyrics Card Generator

### Créer des cartes de paroles élégantes à partager

**Apple Music / NetEase Cloud Music / QQ Music · Application Windows · Export PNG haute résolution · Documentation française**

[简体中文](./README.md) · [繁體中文](./README.zh-TW.md) · [English](./README.en.md) · [日本語](./README.ja.md) · [Español](./README.es.md) · [Dernière version](https://github.com/Qrzzzz/lyrics-card-generator/releases/latest) · [Fonctionnalités](#fonctionnalités) · [Développement](#développement-local) · [Licence](./LICENSE)

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

Téléchargez la dernière version depuis GitHub Releases :

* Installateur recommandé : `Lyrics Card Generator Setup 3.0.0.exe`
* Version portable : `Lyrics Card Generator-3.0.0-portable.exe`

L'installateur est recommandé pour une utilisation régulière. La version portable convient aux essais, à une utilisation temporaire ou à un disque amovible.

> La version actuelle n'est pas signée. Windows peut afficher un avertissement SmartScreen, ce qui est courant pour une application personnelle non signée.

<a id="fonctionnalités"></a>

## ✨ Fonctionnalités

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
* Vérification des mises à jour GitHub

## 🚀 Utilisation

1. Lancez l'application.
2. Collez un lien Apple Music, NetEase Cloud Music ou QQ Music, ou saisissez les informations manuellement.
3. Vous pouvez aussi importer un MP3 / FLAC local pour lire les métadonnées, la pochette et les paroles intégrées.
4. Modifiez les paroles et traductions ; utilisez la traduction par IA ou séparez automatiquement les textes alternant original / traduction selon la langue d'interface.
5. Ajustez le ratio, les polices, les polices système Windows, les couleurs, cadres, filigranes et autres styles.
6. Prévisualisez la carte à droite.
7. Utilisez « Terminer et exporter » pour enregistrer l'image PNG.

## 🔄 Vérification des mises à jour

L'application propose un bouton « Vérifier les mises à jour ».
Il interroge GitHub Releases via une route API Next locale, compare la version actuelle avec la dernière version publiée et privilégie les installateurs ou versions portables lorsqu'ils existent.

Cette fonction vérifie uniquement les mises à jour et ouvre la page de téléchargement. Elle ne télécharge pas silencieusement d'installateur et ne remplace pas l'application automatiquement.

<a id="développement-local"></a>

## 🛠️ Développement local

Node.js et npm sont nécessaires.

```bash
npm install
npm run dev
```

Ouvrez ensuite :

```text
http://localhost:3000
```

## 🖥️ Développement et packaging bureau

Lancer l'application de bureau en développement :

```bash
npm run desktop:dev
```

Construire un dossier desktop non empaqueté pour inspection :

```bash
npm run desktop:pack
```

Construire l'installateur Windows et l'EXE portable :

```bash
npm run desktop:build
```

Les artefacts sont écrits dans :

```text
release/
```

Le service Next standalone est préparé dans :

```text
dist-desktop/server
```

## 📜 Scripts

```bash
npm run dev             # Démarrer le serveur de développement Web
npm run build           # Construire l'application Next.js
npm run typecheck       # Lancer la vérification TypeScript
npm run desktop:dev     # Démarrer Electron en mode développement
npm run desktop:pack    # Construire un dossier desktop non empaqueté
npm run desktop:build   # Construire l'installateur Windows et l'EXE portable
npm run parse:test      # Tester l'analyse des liens de morceaux
npm run core:test       # Tester les fonctions pures du noyau 3.0
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

Elles apportent une base typographique solide et lisible pour les cartes de paroles en chinois.

La version 3.0.0 peut aussi énumérer les polices système Windows pour la typographie personnalisée. Les builds Web ne peuvent pas énumérer les polices système, mais les préréglages existants restent disponibles.

## 🙏 Remerciements

Merci à [Apple Music](https://music.apple.com/). Le fond coloré, l'atmosphère fluide et les premières idées de mise en page ont été inspirés par son expérience visuelle. Ce projet n'est pas affilié à Apple Music et ne représente pas sa position officielle.

Merci à [Source Han Sans](https://github.com/adobe-fonts/source-han-sans) et [Source Han Serif](https://github.com/adobe-fonts/source-han-serif) pour la base typographique utilisée par les cartes.

Merci à [Sabrina Carpenter](https://www.sabrinacarpenter.com/) pour « opposite ». Le morceau sert d'exemple de démarrage et a aidé à définir le rythme visuel initial des paroles anglaises et des traductions chinoises. Tous les droits appartiennent à leurs détenteurs respectifs. Ce projet ne distribue aucun contenu audio.

Merci à [OpenAI Codex](https://openai.com/codex/) pour avoir transformé de nombreuses idées en code fonctionnel, workflows de packaging bureau et fonctionnalités réelles.

Merci à [ChatGPT 5.5](https://chatgpt.com/) pour le diagnostic, la conception de solutions, la revue de corrections et les contrôles d'acceptation.

Merci à [ReactBits](https://www.reactbits.dev/) pour plusieurs idées d'interface et de motion design.

Merci à Rangerov pour son attention et ses retours.

Merci à [Sakuramble](https://github.com/Sakuramble) pour les suggestions d'allègement du code. Les optimisations correspondantes ont été intégrées dans [`v1.1.0`](https://github.com/Qrzzzz/lyrics-card-generator/releases/tag/v1.1.0).

Merci également aux mainteneurs de [Next.js](https://nextjs.org/), [React](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Tailwind CSS](https://tailwindcss.com/), [Electron](https://www.electronjs.org/), [electron-builder](https://www.electron.build/), [html-to-image](https://github.com/bubkoo/html-to-image), [Framer Motion](https://motion.dev/), [Lucide React](https://lucide.dev/), [Cheerio](https://cheerio.js.org/), [Zod](https://zod.dev/) et à l'écosystème frontend moderne.

## 📄 Licence

Ce projet est publié sous une licence personnalisée Source Available, et non sous une licence open source traditionnelle.

Vous pouvez consulter, télécharger, exécuter et modifier le code source à titre personnel, non commercial, éducatif ou d'évaluation. L'usage commercial, la redistribution, le repackaging, la publication publique de versions modifiées et les produits concurrents basés sur ce projet nécessitent l'autorisation écrite préalable du titulaire des droits.

Les dépendances open source tierces restent régies par leurs licences respectives. Voir [LICENSE](./LICENSE) pour plus de détails.
