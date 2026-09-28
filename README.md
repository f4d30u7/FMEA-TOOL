# PFMEA Flow v0.4.1

Aplicación web estática y local-first para ejecutar AMFE de Proceso desde el mapa del proceso hasta la evaluación, las acciones y las exportaciones.

## Publicación recomendada

Este repositorio está preparado para GitHub Pages mediante GitHub Actions. El contenido que se publica está dentro de `site/`.

1. Crear un repositorio llamado `pfmea-flow`.
2. Cargar el contenido de esta carpeta en la rama `main`.
3. Abrir `Settings > Pages`.
4. En `Build and deployment`, seleccionar `GitHub Actions`.
5. Abrir la pestaña `Actions` y verificar que finalice `Deploy PFMEA Flow to GitHub Pages`.
6. Acceder a `https://TU-USUARIO.github.io/pfmea-flow/`.

La aplicación utiliza rutas relativas, por lo que funciona correctamente como sitio de proyecto bajo `/pfmea-flow/`.

## Datos de los proyectos

Los proyectos PFMEA no se guardan en GitHub. Se conservan en IndexedDB dentro del navegador y del origen exacto de la página. Para trasladarlos o respaldarlos, usar la exportación `.pfmea.json` de la aplicación.

No agregar al repositorio exportaciones reales, archivos JSON de proyectos, Excel ni PDF. `.gitignore` ya excluye esos formatos para reducir accidentes humanos, aunque no reemplaza prestar atención antes de publicar.

## Contenido público seguro

La edición incluida aquí contiene un ejemplo genérico de llenado y no incluye el proyecto Guardian ni información de productos, plantas o documentos reales. El workflow ejecuta una validación automática y bloquea la publicación si reaparecen ciertos términos reservados.

## Estructura

```text
.github/workflows/deploy-pages.yml   Publicación automática
site/                                Sitio que recibe GitHub Pages
scripts/validate-deploy.mjs          Validación previa al deployment
docs/                                Guías operativas y de despliegue
```

## Actualizaciones

Cada cambio confirmado en la rama `main` ejecuta el workflow y reemplaza el sitio publicado. Antes de cambiar el nombre del repositorio, el dominio o la URL, exportar todos los proyectos: el almacenamiento del navegador está asociado al origen de la página.

## Alcance de seguridad

La aplicación no tiene backend, autenticación ni sincronización. No realiza solicitudes a servicios externos; únicamente descarga los archivos que el usuario genera y solicita recursos del mismo sitio. Para registros oficiales, conservar las exportaciones aprobadas en el repositorio documental definido por la organización.

No se incluye una licencia de reutilización. Todos los derechos permanecen con el propietario del repositorio.
