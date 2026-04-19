# Juego de adivinanzas para parejas a distancia

Proyecto web para dos personas que juegan a distancia. El estado de cada sala se guarda como un archivo JSON en un repositorio de GitHub usando la API de GitHub desde un backend seguro.

## Caracteristicas

- Crear sala con codigo unico
- Unirse a una sala existente
- Preguntas romanticas, divertidas o profundas
- Sistema de rondas y puntajes
- El jugador con menos puntos recibe un reto o una pregunta especial
- Guardado persistente en GitHub
- Interfaz web simple y lista para usar

## Requisitos

- Node.js 18 o superior
- Un repositorio de GitHub que actuara como almacenamiento
- Un token personal de GitHub con permisos sobre el repositorio

## Instalacion

1. Copia `.env.example` a `.env`
2. Completa tus variables
3. Instala dependencias:

```bash
npm install
```

4. Ejecuta el proyecto:

```bash
npm start
```

5. Abre en el navegador:

```text
http://localhost:3000
```

## Repositorio de datos en GitHub

Crea un repositorio vacio para almacenar las salas. El sistema escribira archivos JSON dentro de una carpeta como `rooms/`.

Ejemplo de estructura remota:

```text
rooms/SALA-AB12CD.json
rooms/SALA-X9K2LM.json
```

## Variables de entorno

- `PORT`: puerto del servidor
- `GITHUB_TOKEN`: token personal de GitHub
- `GITHUB_OWNER`: usuario o organizacion
- `GITHUB_REPO`: repositorio donde se guardaran los JSON
- `GITHUB_BRANCH`: rama principal
- `GITHUB_DATA_DIR`: carpeta remota dentro del repo

## Flujo del juego

1. Jugador 1 crea la sala y espera
2. Jugador 2 se une con el codigo
3. Cada ronda uno responde una pregunta y el otro adivina
4. Si acierta, gana puntos
5. El jugador con menos puntos recibe un reto o pregunta especial
6. El estado se actualiza y se guarda en GitHub

## Nota importante

Por seguridad, el token de GitHub se usa solo en el backend. No lo coloques en el frontend.


## Despliegue en Vercel

1. Sube esta carpeta a GitHub
2. Importa el repositorio en Vercel
3. Agrega las variables de entorno desde Settings > Environment Variables
4. No cambies el comando de instalacion ni el de build
5. Vercel detectara `vercel.json` y publicara la app correctamente

Variables recomendadas en Vercel:

- `GITHUB_TOKEN`
- `GITHUB_OWNER`
- `GITHUB_REPO`
- `GITHUB_BRANCH`
- `GITHUB_DATA_DIR`

Si no colocas esas variables, la app seguira funcionando, pero en Vercel el almacenamiento local no es persistente. Para jugar a distancia de forma estable, configura GitHub.
