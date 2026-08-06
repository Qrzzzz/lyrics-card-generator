<div align="center">

# 🎧 Lyrics Card Generator

### Genera tarjetas de letras de alta calidad listas para compartir

**Spotify / Apple Music / NetEase Cloud Music / QQ Music · aplicación de escritorio para Windows · exportación PNG / WebP / JPG en alta resolución · documentación multilingüe**

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
  <a href="./docs/releases/v5.9.3.es.md">Notas de la versión</a> ·
  <a href="https://qrzzzz.github.io/lyrics-card-generator/">Web Lite en línea</a> ·
  <a href="#funciones-principales">Funciones principales</a> ·
  <a href="#desarrollo-local">Desarrollo local</a> ·
  <a href="./LICENSE">Licencia</a>
</p>

![Platform](https://img.shields.io/badge/Platform-Windows%20Desktop-111827)
![Stack](https://img.shields.io/badge/Stack-Next.js%20%2B%20React%20%2B%20TypeScript-0F766E)
![Desktop](https://img.shields.io/badge/Desktop-Electron-1D4ED8)
![Output](https://img.shields.io/badge/Output-PNG%20%2F%20WebP%20%2F%20JPG-FF5722)
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

Una aplicación de escritorio para Windows que crea tarjetas de letras.
Pega un enlace de canción o introduce la información manualmente, edita letras, traducciones, portada y estilos visuales, y exporta una imagen PNG, WebP o JPG de alta resolución para compartir.

## 📦 Descarga e instalación

Consulta [GitHub Releases](https://github.com/Qrzzzz/lyrics-card-generator/releases/latest) para las compilaciones disponibles públicamente. El empaquetado local de la versión candidata v5.9.3 usa estos nombres:

* Instalador: `Lyrics Card Generator Setup 5.9.3.exe`
* Versión portable: `Lyrics Card Generator-5.9.3-portable.exe`

El instalador se recomienda para uso habitual. La versión portable es útil para pruebas, uso temporal o ejecución desde una unidad extraíble.

> La compilación actual no está firmada. Windows puede mostrar una advertencia de SmartScreen, algo habitual en aplicaciones personales sin firma.

### Novedades de v5.9.3 (versión candidata local)

* Refuerza el arranque empaquetado de Windows con una prueba HMAC distinta en cada ejecución, gestión de cierre seguro ante fallos de inicio, salida temprana y conflictos de puerto, y un único propietario para la ventana, el servidor local y la escritura del historial.
* Aplica un límite de streaming de 100 MiB a los MP3 / FLAC y, antes de expandir Base64 / JSON, presupuestos de 8 MiB para portadas incrustadas y 256 Ki de caracteres para letras. El análisis de acceso aleatorio conserva las etiquetas APEv2 finales sin crear una segunda copia completa.
* Mejora la extracción de artistas de Spotify y la clasificación de candidatos de NetEase, conservando sufijos legítimos de remasterización, mezcla y directo y priorizando coincidencias exactas de título / artista.
* Actualiza a Next.js 15.5.21, desactiva la entrada del optimizador de imágenes que no se usa y completa las dependencias standalone del escritorio. Estos metadatos describen una versión candidata local; la disponibilidad pública depende de la página activa de GitHub Releases.

## 🌐 Notas de publicación multilingües

GitHub Release muestra de forma predeterminada un resumen en chino simplificado. Consulta las notas completas:
[简体中文](./docs/releases/v5.9.3.zh-CN.md) · [繁體中文](./docs/releases/v5.9.3.zh-TW.md) · [English](./docs/releases/v5.9.3.en.md) · [Français](./docs/releases/v5.9.3.fr.md) · [日本語](./docs/releases/v5.9.3.ja.md) · [Español](./docs/releases/v5.9.3.es.md)

<a id="funciones-principales"></a>

## ✨ Funciones principales

### 🎨 Generación de imágenes y diseño del lienzo

* Genera imágenes de letras con acabado pulido
* Tamaños verticales, horizontales y de lienzo personalizado
* Diseño horizontal reconstruido con áreas seguras, columna de portada, columna de contenido y regiones de pie
* Ancho y altura automáticos medidos para lienzos verticales personalizados
* Exportación PNG, WebP y JPG de alta resolución

### 📝 Diseño y traducción de letras

* Diseño de letra original y traducción
* Separación automática de líneas original / traducción con detección de chino simplificado, chino tradicional, inglés, francés, japonés y español
* Traducción de letras con IA mediante API Chat Completions compatibles con OpenAI, con URL del proveedor, modelo, clave API, seis preajustes predeterminados, hasta dos personalizados, Reasoning y salida en streaming configurables

### 🎵 Búsqueda de canciones, enlaces musicales y archivos locales

* Busca en NetEase Cloud Music por título, artista o álbum e importa metadatos y letras desde el resultado elegido
* Análisis de enlaces de Spotify, Apple Music, NetEase Cloud Music y QQ Music
* Análisis de metadatos MP3 / FLAC locales para título, artista, álbum, portada y letras incrustadas

### ✍️ Edición manual y subida de material

* Edición manual de título, artista, portada y letra
* Subida de portada local

### 🌈 Estilo visual e información de marca

* Extracción de paleta desde la portada para fondos degradados
* Modos de apariencia de la interfaz: Dinámico del álbum, oscuro, claro, Acrílico oscuro y Acrílico claro
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
* Generación y exportación PNG, WebP y JPG

Estas funciones requieren internet:

* Análisis de enlaces de plataformas musicales
* Búsqueda en NetEase Cloud Music y obtención de letras
* Carga de portadas remotas
* Obtención automática de letras
* Traducción de letras con IA
* Búsqueda de actualizaciones en GitHub Releases

## 🚀 Uso

1. Inicia la aplicación.
2. Busca en NetEase Cloud Music por título, artista o álbum y elige un candidato para importar metadatos, portada y letras.
3. También puedes pegar un enlace de Spotify, Apple Music, NetEase Cloud Music o QQ Music, o subir un MP3 / FLAC local.
4. Edita letras y traducciones; usa traducción con IA o separa texto original / traducido alternado según el idioma de interfaz seleccionado.
5. Ajusta proporción del lienzo, combinaciones CJK / latinas, colores, marcos, marcas de agua y otros estilos.
6. Previsualiza la tarjeta a la derecha.
7. Elige PNG, WebP o JPG y usa “Completar y exportar” para guardar la imagen.

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

Gracias a [OpenAI Codex](https://openai.com/codex/). Convirtió muchas ideas dispersas en código ejecutable, flujos de build para la versión de escritorio y funciones reales.

Gracias a [ChatGPT 5.6 Sol](https://chatgpt.com/) por ayudar durante el desarrollo con la localización de problemas, el diseño de soluciones, la revisión de correcciones y las comprobaciones de aceptación.

Gracias a [ReactBits](https://www.reactbits.dev/) por varias ideas de UI, incluidas inspiraciones de animación como Spark Cursor.

Gracias a [Rangerov](https://github.com/rangerov0716) por prestar atención a este proyecto y aportar sugerencias.

Gracias a [V0idream](https://github.com/V0idream) por proponer mejoras para aligerar el código. [`v1.1.0`](https://github.com/Qrzzzz/lyrics-card-generator/releases/tag/v1.1.0) ya incorporó optimizaciones relacionadas.


Gracias a las siguientes canciones y sus creadores. Sirven como ejemplos del proyecto, ayudando a verificar cómo se muestran las tarjetas de letras en diferentes idiomas, fuentes, longitudes de traducción y ritmos de composición.

<details>
<summary>Desplegar para ver ejemplos de canciones</summary>

| Canción | Álbum | Artista |
| --- | --- | --- |
| 《opposite》 | *emails i can't send fwd:* | [Sabrina Carpenter](https://www.sabrinacarpenter.com/) |
| 《勇者》 | *THE BOOK 3* | [YOASOBI](https://www.yoasobi-music.jp/) |
| 《光辉岁月》 | *命运派对* | [Beyond](https://music.apple.com/cn/artist/beyond/79668659) |
| 《Opalite》 | *The Life of a Showgirl* | [Taylor Swift](https://www.taylorswift.com/) |
| 《honeybee》 | *you seem pretty sad for a girl so in love* | [Olivia Rodrigo](https://www.oliviarodrigo.com/) |
| 《Lies》 | *Always - EP* | [BIGBANG](https://ygfamily.com/en/artists/bigbang/discography) |

</details>

Gracias también a estos proyectos open source y a sus mantenedores: [Next.js](https://nextjs.org/), [React](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Tailwind CSS](https://tailwindcss.com/), [Electron](https://www.electronjs.org/), [electron-builder](https://www.electron.build/), [html-to-image](https://github.com/bubkoo/html-to-image), [Framer Motion](https://motion.dev/), [Lucide React](https://lucide.dev/), [Cheerio](https://cheerio.js.org/), [Zod](https://zod.dev/) y las numerosas cadenas de herramientas que forman el ecosistema frontend moderno. Sin esta infraestructura, este proyecto no existiría en su forma actual.

## 📄 Licencia

Este proyecto se publica bajo una licencia Source Available personalizada, no una licencia open-source tradicional.

Puedes ver, descargar, ejecutar y modificar de forma privada el código fuente para fines personales, no comerciales, educativos y de evaluación. El uso comercial, la redistribución, el reempaquetado, las versiones modificadas públicas y los productos competidores basados en este proyecto requieren autorización previa por escrito del titular de los derechos.

Las dependencias open-source de terceros siguen rigiéndose por sus respectivas licencias. Consulta [LICENSE](./LICENSE) para más detalles.
