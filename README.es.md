<div align="center">

# 🎧 Lyrics Card Generator

### Genera tarjetas de letras de alta calidad listas para compartir

**Spotify / Apple Music / NetEase Cloud Music / QQ Music · aplicación de escritorio para Windows · exportación PNG en alta resolución · documentación multilingüe**

<p>
  <strong>Idioma</strong><br/>
  <a href="./README.md">简体中文</a> ·
  <a href="./README.zh-TW.md">繁體中文</a> ·
  <a href="./README.en.md">English</a> ·
  <a href="./README.fr.md">Français</a> ·
  <a href="./README.ja.md">日本語</a> ·
  <strong>Español</strong>
</p>

<p>
  <strong>Navegación</strong><br/>
  <a href="https://github.com/Qrzzzz/lyrics-card-generator/releases/latest">Descargar la última versión</a> ·
  <a href="./docs/releases/v3.7.1.es.md">Notas de la versión</a> ·
  <a href="#funciones-principales">Funciones principales</a> ·
  <a href="#desarrollo-local">Desarrollo local</a> ·
  <a href="./LICENSE">Licencia</a>
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

Una aplicación de escritorio para Windows que genera tarjetas de letras pulidas.
Pega un enlace de canción o introduce la información manualmente, edita letras, traducciones, portada y estilos visuales, y exporta una imagen PNG de alta resolución para compartir.

## 📦 Descarga e instalación

Descarga la versión más reciente desde [GitHub Releases](https://github.com/Qrzzzz/lyrics-card-generator/releases/latest):

* Instalador recomendado: `Lyrics Card Generator Setup 3.7.1.exe`
* Versión portable: `Lyrics Card Generator-3.7.1-portable.exe`

El instalador se recomienda para uso habitual. La versión portable es útil para pruebas, uso temporal o ejecución desde una unidad extraíble.

> La compilación actual no está firmada. Windows puede mostrar una advertencia de SmartScreen, algo habitual en aplicaciones personales sin firma.

### Aspectos destacados de la versión 3.7.1

* Estandariza los interruptores del panel de estilo, la entrada de letras, la información de la canción y los ajustes para que el comportamiento sea más coherente.
* Reordena elecciones únicas como la selección de idioma en tarjetas de opción compartidas y alinea el modo de diseño, la densidad de la cuadrícula y marco / sangrado completo dentro de un mismo patrón de control segmentado.
* Unifica el aspecto y la respuesta interactiva de inputs, áreas de texto, selectores y botones de acción habituales del panel de ajustes.
* Mejora la usabilidad con teclado, la visibilidad del foco, la presentación de etiquetas y la respuesta de estados deshabilitados para los controles comunes.
* Prepara la capa de controles de interfaz para la futura actualización de animaciones de la v3.8.0 sin incorporar todavía ese sistema.

<br clear="right" />

## 🌐 Notas de publicación multilingüe

La página de GitHub Release utiliza por defecto la versión corta en chino simplificado, las notas de publicación completas se mantienen en `docs/releases/`:

* [简体中文](./docs/releases/v3.7.1.zh-CN.md)
* [繁體中文](./docs/releases/v3.7.1.zh-TW.md)
* [English](./docs/releases/v3.7.1.en.md)
* [Français](./docs/releases/v3.7.1.fr.md)
* [日本語](./docs/releases/v3.7.1.ja.md)
* [Español](./docs/releases/v3.7.1.es.md)

<a id="funciones-principales"></a>

## ✨ Funciones principales

### 🎨 Generación de imágenes y diseño del lienzo

* Genera imágenes de letras con acabado pulido
* Tamaños verticales, horizontales y de lienzo personalizado
* Diseño horizontal reconstruido con áreas seguras, columna de portada, columna de contenido y regiones de pie
* Altura automática medida para lienzos verticales personalizados
* Exportación PNG de alta resolución

### 📝 Diseño y traducción de letras

* Diseño de letra original y traducción
* Separación automática de líneas original / traducción con detección de chino simplificado, chino tradicional, inglés, francés, japonés y español
* Traducción de letras con IA mediante API Chat Completions compatibles con OpenAI, con URL del proveedor, modelo, clave API, seis estilos, Reasoning y salida en streaming configurables

### 🎵 Enlaces musicales y análisis de archivos locales

* Análisis de enlaces de Spotify, Apple Music, NetEase Cloud Music y QQ Music
* Análisis de metadatos MP3 / FLAC locales para título, artista, álbum, portada y letras incrustadas

### ✍️ Edición manual y subida de material

* Edición manual de título, artista, portada y letra
* Subida de portada local

### 🌈 Estilo visual e información de marca

* Extracción de paleta desde la portada para fondos degradados
* Logo de plataforma, texto de compartido por y marca de agua generada

### 🔤 Fuentes e interfaz multilingüe

* Combinaciones Source Han Sans / Serif, fuentes CJK y latinas independientes, selector de fuentes del sistema y vista previa con letras reales
* Interfaz en chino simplificado, chino tradicional, inglés, francés, japonés y español

### 🚀 Actualizaciones

* Búsqueda de actualizaciones en GitHub Releases

## 🪟 Versión de escritorio para Windows

La versión de escritorio conserva la interfaz Web de Next.js y las rutas API originales, y las envuelve con Electron.

Al iniciar el EXE, se lanza un servicio Next local en la máquina del usuario y se abre en una ventana de escritorio. Los usuarios normales solo tienen que hacer doble clic en el EXE. No necesitan conocer Node.js, npm ni servidores locales de desarrollo.

La aplicación de escritorio puede iniciarse sin conexión. Estas funciones siguen disponibles sin internet:

* Edición manual de información de la canción
* Edición manual de letras y traducciones
* Subida de portada local
* Análisis de metadatos y letras incrustadas en MP3 / FLAC locales
* Personalización visual
* Generación y exportación PNG

Estas funciones requieren internet:

* Análisis de enlaces de plataformas musicales
* Carga de portadas remotas
* Obtención automática de letras
* Traducción de letras con IA
* Búsqueda de actualizaciones en GitHub Releases

## 🚀 Uso

1. Inicia la aplicación.
2. Pega un enlace de Spotify, Apple Music, NetEase Cloud Music o QQ Music, o introduce la información manualmente.
3. Opcionalmente sube un archivo MP3 / FLAC local para leer metadatos, portada y letras incrustadas.
4. Edita letras y traducciones; usa traducción con IA o separa texto original / traducido alternado según el idioma de interfaz seleccionado.
5. Ajusta proporción del lienzo, combinaciones CJK / latinas, colores, marcos, marcas de agua y otros estilos.
6. Previsualiza la tarjeta a la derecha.
7. Usa “Completar y exportar” para guardar la imagen PNG.

## 🔄 Búsqueda de actualizaciones

La aplicación incluye un botón “Buscar actualizaciones”.
Solicita las GitHub Releases de este proyecto a través de una ruta API local de Next, compara la versión actual con la última publicada y prioriza los recursos de instalador / portable cuando están disponibles.

Esta función solo busca actualizaciones y abre la página de descarga. No descarga instaladores en silencio ni sustituye automáticamente la aplicación actual.

<a id="desarrollo-local"></a>

## 🛠️ Desarrollo local

Se requieren Node.js y npm.

```bash
npm install
npm run dev
```

Después abre:

```text
http://localhost:3000
```

## 🖥️ Desarrollo de escritorio y empaquetado

Ejecuta la aplicación de escritorio en modo desarrollo:

```bash
npm run desktop:dev
```

Construye un directorio de escritorio unpacked para inspección:

```bash
npm run desktop:pack
```

Construye tanto el instalador de Windows como el EXE portable:

```bash
npm run desktop:build
```

Los artefactos de compilación se escriben en:

```text
release/
```

El servicio Next standalone empaquetado se prepara en:

```text
dist-desktop/server
```

## 📜 Scripts

```bash
npm run dev             # Inicia el servidor de desarrollo Web
npm run build           # Compila la aplicación Next.js
npm run typecheck       # Ejecuta la comprobación de tipos TypeScript
npm run desktop:dev     # Inicia el modo de desarrollo de Electron
npm run desktop:pack    # Construye un directorio de escritorio unpacked
npm run desktop:build   # Construye el instalador de Windows y el EXE portable
npm run parse:test      # Prueba el análisis de enlaces de canciones
npm run core:test       # Prueba las funciones puras del núcleo 3.0
```

## 🧩 Stack tecnológico

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
* Inspiración UI de ReactBits

## 🔤 Fuentes

El proyecto usa:

* Source Han Sans
* Source Han Serif

Aportan una base tipográfica sólida, clara y fiable para tarjetas de letras en chino.

La versión 3.1.0 ofrece combinaciones Source Han Sans y Source Han Serif y permite elegir por separado las fuentes CJK y latinas. Fuentes ahora es un paso independiente junto a Letras, Diseño y Detalles visuales. La aplicación de escritorio puede enumerar fuentes del sistema Windows; las versiones Web conservan las fuentes recomendadas y los presets integrados. La vista previa completa aparece debajo de la tarjeta real en la columna derecha y usa su mismo algoritmo de fondo con Azul abisal, Cobalto, Índigo y Azul nocturno como entradas fijas; no modifica el fondo real de la tarjeta ni se incluye en el PNG exportado.

## 🙏 Agradecimientos

Gracias a [Apple Music](https://music.apple.com/). Los degradados de color, la estética de fondo con luz fluida y la orientación inicial del diseño de las tarjetas de letras de este proyecto se inspiraron en la experiencia visual de Apple Music. Este proyecto no está afiliado a Apple Music ni representa la postura oficial de Apple Music.

Gracias a [Source Han Sans](https://github.com/adobe-fonts/source-han-sans) y [Source Han Serif](https://github.com/adobe-fonts/source-han-serif). Proporcionan una base tipográfica estable, clara y con peso para las tarjetas de letras en chino.

Gracias a [Sabrina Carpenter](https://www.sabrinacarpenter.com/) y a “opposite”. Como ejemplo predeterminado al iniciar la aplicación, ayudó a definir el ritmo visual del diseño inicial, de las letras en inglés y de la traducción al chino.

Gracias a [YOASOBI](https://www.yoasobi-music.jp/) y a “勇者”. Se usa como texto de ejemplo en la visualización de muestras de letras y ayudó a comprobar el efecto de distintas fuentes dentro de las tarjetas.

Gracias a [OpenAI Codex](https://openai.com/codex/). Convirtió muchas ideas dispersas en código ejecutable, flujos de build para la versión de escritorio y funciones reales.

Gracias a [ChatGPT 5.5](https://chatgpt.com/) por ayudar durante el desarrollo con la localización de problemas, el diseño de soluciones, la revisión de correcciones y las comprobaciones de aceptación.

Gracias a [ReactBits](https://www.reactbits.dev/) por varias ideas de UI, incluidas inspiraciones de animación como Spark Cursor.

Gracias a Rangerov por prestar atención a este proyecto y aportar sugerencias.

Gracias a [V0idream](https://github.com/V0idream) por proponer mejoras para aligerar el código. [`v1.1.0`](https://github.com/Qrzzzz/lyrics-card-generator/releases/tag/v1.1.0) ya incorporó optimizaciones relacionadas.

Gracias también a estos proyectos open source y a sus mantenedores: [Next.js](https://nextjs.org/), [React](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Tailwind CSS](https://tailwindcss.com/), [Electron](https://www.electronjs.org/), [electron-builder](https://www.electron.build/), [html-to-image](https://github.com/bubkoo/html-to-image), [Framer Motion](https://motion.dev/), [Lucide React](https://lucide.dev/), [Cheerio](https://cheerio.js.org/), [Zod](https://zod.dev/) y las numerosas cadenas de herramientas que forman el ecosistema frontend moderno. Sin esta infraestructura, este proyecto no existiría en su forma actual.

## 📄 Licencia

Este proyecto se publica bajo una licencia Source Available personalizada, no una licencia open-source tradicional.

Puedes ver, descargar, ejecutar y modificar de forma privada el código fuente para fines personales, no comerciales, educativos y de evaluación. El uso comercial, la redistribución, el reempaquetado, las versiones modificadas públicas y los productos competidores basados en este proyecto requieren autorización previa por escrito del titular de los derechos.

Las dependencias open-source de terceros siguen rigiéndose por sus respectivas licencias. Consulta [LICENSE](./LICENSE) para más detalles.

## Star History

<a href="https://www.star-history.com/?repos=Qrzzzz%2Flyrics-card-generator&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=Qrzzzz/lyrics-card-generator&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=Qrzzzz/lyrics-card-generator&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=Qrzzzz/lyrics-card-generator&type=date&legend=top-left" />
 </picture>
</a>
