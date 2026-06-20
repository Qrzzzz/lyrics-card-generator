<div align="center">

# 🎧 Lyrics Card Generator

### Crea tarjetas de letras pulidas para compartir

**Apple Music / NetEase Cloud Music / QQ Music · Escritorio Windows · Exportación PNG de alta resolución · Documentación en español**

[简体中文](./README.md) · [繁體中文](./README.zh-TW.md) · [English](./README.en.md) · [Français](./README.fr.md) · [日本語](./README.ja.md) · [Última versión](https://github.com/Qrzzzz/lyrics-card-generator/releases/latest) · [Funciones](#funciones) · [Desarrollo](#desarrollo-local) · [Licencia](./LICENSE)

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

Descarga la versión más reciente desde GitHub Releases:

* Instalador recomendado: `Lyrics Card Generator Setup 3.0.0.exe`
* Versión portable: `Lyrics Card Generator-3.0.0-portable.exe`

El instalador se recomienda para uso habitual. La versión portable es útil para pruebas, uso temporal o ejecución desde una unidad extraíble.

> La compilación actual no está firmada. Windows puede mostrar una advertencia de SmartScreen, algo habitual en aplicaciones personales sin firma.

<a id="funciones"></a>

## ✨ Funciones

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

## 🚀 Cómo usar

1. Inicia la aplicación.
2. Pega un enlace de Apple Music, NetEase Cloud Music o QQ Music, o introduce la información manualmente.
3. Opcionalmente sube un MP3 / FLAC local para leer metadatos, portada y letras incrustadas.
4. Edita letras y traducciones; usa la traducción con IA o separa automáticamente el texto alternado original / traducción según el idioma de interfaz seleccionado.
5. Ajusta el ratio del lienzo, fuentes, fuentes del sistema Windows, colores, marcos, marcas de agua y otros estilos.
6. Previsualiza la tarjeta a la derecha.
7. Usa “Completar y exportar” para guardar la imagen PNG.

## 🔄 Búsqueda de actualizaciones

La aplicación incluye un botón “Buscar actualizaciones”.
Solicita los GitHub Releases del proyecto mediante una ruta API local de Next, compara la versión actual con la última versión publicada y prioriza los instaladores o versiones portables cuando están disponibles.

Esta función solo comprueba actualizaciones y abre la página de descarga. No descarga instaladores en segundo plano ni reemplaza la aplicación automáticamente.

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

## 🖥️ Desarrollo y empaquetado de escritorio

Ejecutar la app de escritorio en modo desarrollo:

```bash
npm run desktop:dev
```

Construir un directorio de escritorio sin empaquetar para inspección:

```bash
npm run desktop:pack
```

Construir el instalador de Windows y el EXE portable:

```bash
npm run desktop:build
```

Los artefactos se escriben en:

```text
release/
```

El servicio standalone de Next se prepara en:

```text
dist-desktop/server
```

## 📜 Scripts

```bash
npm run dev             # Iniciar el servidor de desarrollo Web
npm run build           # Construir la app Next.js
npm run typecheck       # Ejecutar comprobación de TypeScript
npm run desktop:dev     # Iniciar Electron en modo desarrollo
npm run desktop:pack    # Construir un directorio desktop sin empaquetar
npm run desktop:build   # Construir instalador Windows y EXE portable
npm run parse:test      # Probar análisis de enlaces de canciones
npm run core:test       # Probar funciones puras del núcleo 3.0
```

## 🧩 Stack técnico

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

Proporcionan una base tipográfica sólida, clara y fiable para tarjetas de letras en chino.

La aplicación de escritorio 3.0.0 también puede enumerar fuentes del sistema Windows para tipografía personalizada. Las builds Web no pueden enumerar fuentes del sistema, pero los ajustes de fuente existentes siguen disponibles.

## 🙏 Agradecimientos

Gracias a [Apple Music](https://music.apple.com/). El fondo degradado colorido, la atmósfera fluida y la primera dirección de diseño de las tarjetas se inspiraron en su experiencia visual. Este proyecto no está afiliado a Apple Music ni representa su posición oficial.

Gracias a [Source Han Sans](https://github.com/adobe-fonts/source-han-sans) y [Source Han Serif](https://github.com/adobe-fonts/source-han-serif). Proporcionan la base tipográfica sólida y legible usada por las tarjetas.

Gracias a [Sabrina Carpenter](https://www.sabrinacarpenter.com/) por “opposite”. Se usa como muestra inicial y ayudó a definir el ritmo visual de las letras en inglés y las traducciones al chino. Todos los derechos de la obra musical pertenecen a sus respectivos propietarios. Este proyecto no distribuye contenido de audio.

Gracias a [OpenAI Codex](https://openai.com/codex/) por convertir muchas ideas en código funcional, flujos de empaquetado de escritorio y funciones reales.

Gracias a [ChatGPT 5.5](https://chatgpt.com/) por el diagnóstico, diseño de soluciones, revisión de correcciones y comprobaciones de aceptación durante el desarrollo.

Gracias a [ReactBits](https://www.reactbits.dev/) por varias ideas de UI, incluido Spark Cursor y otras inspiraciones de movimiento.

Gracias a Rangerov por la atención al proyecto y sus comentarios.

Gracias a [Sakuramble](https://github.com/Sakuramble) por sugerir mejoras de reducción de código. Las optimizaciones relevantes se implementaron en [`v1.1.0`](https://github.com/Qrzzzz/lyrics-card-generator/releases/tag/v1.1.0).

Gracias también a quienes mantienen [Next.js](https://nextjs.org/), [React](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Tailwind CSS](https://tailwindcss.com/), [Electron](https://www.electronjs.org/), [electron-builder](https://www.electron.build/), [html-to-image](https://github.com/bubkoo/html-to-image), [Framer Motion](https://motion.dev/), [Lucide React](https://lucide.dev/), [Cheerio](https://cheerio.js.org/), [Zod](https://zod.dev/) y al ecosistema frontend moderno.

## 📄 Licencia

Este proyecto se publica bajo una licencia personalizada Source Available, no bajo una licencia open source tradicional.

Puedes ver, descargar, ejecutar y modificar el código fuente para fines personales, no comerciales, educativos y de evaluación. El uso comercial, redistribución, reempaquetado, publicaciones públicas modificadas y productos competidores basados en este proyecto requieren permiso escrito previo del titular de los derechos.

Las dependencias open source de terceros siguen regidas por sus respectivas licencias. Consulta [LICENSE](./LICENSE) para más detalles.
