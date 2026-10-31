# Pruebas

**TLDR:** `npm test`, `npm run test:integration` y `npm run test:e2e`. E2e va de a un worker; no rompas `#nombre`, `#m`, `Send` ni `#messages`.

Tres suites, cada una en su carpeta para que no se pisen:

| Comando | Qué corre |
|---|---|
| `npm test` | Mocha BDD en `test/test.js` (Chai `expect`) |
| `npm run test:integration` | Jest en `integration/**/*.test.js` (socket en `chat.test.js`; `/health`, `POST /api/mensajes` y `/fallo` en `api.test.js`) |
| `npm run test:e2e` | Playwright en `e2e/`, Chromium visible, `slowMo: 1000` |

`server.js` solo hace `listen` cuando se ejecuta directo (`require.main === module`) y exporta el servidor HTTP. Los tests de integración escuchan en el puerto `0`.

Playwright usa un solo worker. El servidor reenvía cada mensaje a todos los sockets; correr e2e en paralelo mezcla los mensajes entre tests.

Selectores que no se rompen: título `Chat Socket.IO UNA`, `#nombre`, `#m`, botón `Send`, `#messages`. El estado vacío no es un `li` dentro de `#messages`. Un `<script>` se ve como texto y no abre un diálogo. Una URL de imagen aceptada queda en `img[src]`; una de YouTube, en un `iframe` de embed.
