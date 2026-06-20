<div align="center">

# 🎧 Lyrics Card Generator

### Genera tarjetas de letras de alta calidad listas para compartir

**Apple Music / NetEase Cloud Music / QQ Music · aplicación de escritorio para Windows · exportación PNG en alta resolución · documentación multilingüe**

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
  <a href="./docs/releases/v3.0.0.es.md">Notas de la versión</a> ·
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

Una aplicación de escritorio para Windows que genera tarjetas de letras pulidas.
Pega un enlace de canción o introduce la información manualmente, edita letras, traducciones, portada y estilos visuales, y exporta una imagen PNG de alta resolución para compartir.

## 📦 Descarga e instalación

Descarga la versión más reciente desde [GitHub Releases](https://github.com/Qrzzzz/lyrics-card-generator/releases/latest):

* Instalador recomendado: `Lyrics Card Generator Setup 3.0.0.exe`
* Versión portable: `Lyrics Card Generator-3.0.0-portable.exe`

El instalador se recomienda para uso habitual. La versión portable es útil para pruebas, uso temporal o ejecución desde una unidad extraíble.

> La compilación actual no está firmada. Windows puede mostrar una advertencia de SmartScreen, algo habitual en aplicaciones personales sin firma.

<a id="funciones-principales"></a>

## ✨ Funciones principales

* Genera imágenes de letras con acabado pulido
* Tamaños verticales, horizontales y de lienzo personalizado
* Diseño horizontal reconstruido con áreas seguras, columna de portada, columna de contenido y regiones de pie
* Altura automática medida para lienzos verticales personalizados
* Diseño de letra original y traducción
* Separación automática de líneas original / traducción con detección de chino simplificado, chino tradicional, inglés, francés, japonés y español
* Traducción de letras con IA mediante API Chat Completions compatibles con OpenAI, con URL del proveedor, modelo, clave API, seis estilos, Reasoning y salida en streaming configurables
* Análisis de enlaces de Apple Music, NetEase Cloud Music y QQ Music
* Análisis de metadatos MP3 / FLAC locales para título, artista, álbum, portada y letras incrustadas
* Edición manual de título, artista, portada y letra
* Subida de portada local
* Extracción de paleta desde la portada para fondos degradados
* Logo de plataforma, texto de compartido por y marca de agua generada
* Controles de marco, sombra, fuente, fuentes del sistema Windows, tamaño, interlineado y color de texto
* Interfaz en chino simplificado, chino tradicional, inglés, francés, japonés y español
* Exportación PNG de alta resolución
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
* Búsqueda de actualizaciones en GitHub

## 🚀 Uso

1. Inicia la aplicación.
2. Pega un enlace de Apple Music, NetEase Cloud Music o QQ Music, o introduce la información manualmente.
3. Opcionalmente sube un archivo MP3 / FLAC local para leer metadatos, portada y letras incrustadas.
4. Edita letras y traducciones; usa traducción con IA o separa texto original / traducido alternado según el idioma de interfaz seleccionado.
5. Ajusta proporción del lienzo, fuentes, fuentes del sistema Windows, colores, marcos, marcas de agua y otros estilos.
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

La aplicación de escritorio 3.0.0 también puede enumerar fuentes del sistema Windows para tipografía personalizada de tarjetas. Las versiones Web no pueden enumerar fuentes del sistema, pero los presets de fuente existentes siguen disponibles.

## 🙏 Agradecimientos

Gracias a [Apple Music](https://music.apple.com/). El fondo degradado colorido, la atmósfera visual fluida y la primera dirección de diseño de las tarjetas de letras se inspiraron en la experiencia visual de Apple Music. Este proyecto no está afiliado a Apple Music ni representa su postura oficial.

Gracias a [Source Han Sans](https://github.com/adobe-fonts/source-han-sans) y [Source Han Serif](https://github.com/adobe-fonts/source-han-serif). Proporcionan la base tipográfica sólida y legible utilizada por las tarjetas de letras.

Gracias a “opposite” de [Sabrina Carpenter](https://www.sabrinacarpenter.com/). Se usa como ejemplo inicial y ayudó a definir el primer ritmo de diseño para letras en inglés y traducciones al chino. Todos los derechos de la obra musical pertenecen a sus respectivos titulares. Este proyecto no distribuye contenido de audio.

Gracias a [OpenAI Codex](https://openai.com/codex/) por convertir muchas ideas en código funcional, flujos de empaquetado de escritorio y funciones reales de producto.

Gracias a [ChatGPT 5.5](https://chatgpt.com/) por el diagnóstico de problemas, el diseño de soluciones, la revisión de correcciones y las comprobaciones de aceptación durante todo el desarrollo.

Gracias a [ReactBits](https://www.reactbits.dev/) por varias ideas de UI, incluyendo Spark Cursor y otras inspiraciones de movimiento.

Gracias a Rangerov por prestar atención a este proyecto y aportar comentarios.

Gracias a [Sakuramble](https://github.com/Sakuramble) por sugerir mejoras de reducción de código. Las optimizaciones correspondientes se implementaron en [`v1.1.0`](https://github.com/Qrzzzz/lyrics-card-generator/releases/tag/v1.1.0).

Gracias también a los mantenedores de [Next.js](https://nextjs.org/), [React](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Tailwind CSS](https://tailwindcss.com/), [Electron](https://www.electronjs.org/), [electron-builder](https://www.electron.build/), [html-to-image](https://github.com/bubkoo/html-to-image), [Framer Motion](https://motion.dev/), [Lucide React](https://lucide.dev/), [Cheerio](https://cheerio.js.org/), [Zod](https://zod.dev/) y el ecosistema frontend moderno en general. Sin estas bases open-source, este proyecto no existiría en su forma actual.

## 📄 Licencia

Este proyecto se publica bajo una licencia Source Available personalizada, no una licencia open-source tradicional.

Puedes ver, descargar, ejecutar y modificar de forma privada el código fuente para fines personales, no comerciales, educativos y de evaluación. El uso comercial, la redistribución, el reempaquetado, las versiones modificadas públicas y los productos competidores basados en este proyecto requieren autorización previa por escrito del titular de los derechos.

Las dependencias open-source de terceros siguen rigiéndose por sus respectivas licencias. Consulta [LICENSE](./LICENSE) para más detalles.