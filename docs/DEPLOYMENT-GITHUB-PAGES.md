# Deployment en GitHub Pages

## Primera publicación

1. Crear un repositorio nuevo, preferentemente `pfmea-flow`.
2. Elegir visibilidad pública solo si la aplicación genérica puede quedar disponible en Internet.
3. Subir todos los archivos de este paquete a la raíz del repositorio.
4. Confirmar que la rama predeterminada sea `main`.
5. Ir a `Settings > Pages`.
6. En `Source`, seleccionar `GitHub Actions`.
7. Ir a `Actions` y abrir el workflow `Deploy PFMEA Flow to GitHub Pages`.
8. Al finalizar, abrir la URL indicada por el job de deployment.
9. En `Settings > Pages`, activar `Enforce HTTPS` cuando aparezca disponible.

## Publicaciones posteriores

Modificar los archivos dentro de `site/`, actualizar la versión de caché en `site/service-worker.js` y subir los cambios a `main`. El workflow valida y publica automáticamente.

## Repositorio bajo una organización

Si la empresa requiere acceso restringido, no asumir que un repositorio privado vuelve privado al sitio. La publicación privada de Pages requiere capacidades de GitHub Enterprise Cloud y configuración de acceso. En otros planes, usar un hosting interno aprobado.

## Cambio de URL

IndexedDB pertenece al origen exacto. Antes de renombrar el repositorio, cambiar de dominio o mover el sitio:

1. Exportar cada proyecto a `.pfmea.json`.
2. Publicar en la nueva URL.
3. Importar los proyectos en la nueva ubicación.
4. Confirmar las exportaciones antes de retirar la URL anterior.
