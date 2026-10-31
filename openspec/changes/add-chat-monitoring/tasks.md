## 1. Routes

- [x] 1.1 Add `GET /health` returning `{ "estado": "ok" }`
- [x] 1.2 Add `POST /api/mensajes` that validates with `libs/unalib.js`, answers 201 with the validated message, broadcasts it on `Evento-Mensaje-Server`, and answers 400 for a missing message or malformed JSON

## 2. Monitoring

- [x] 2.1 Start Sentry and the OpenTelemetry SDK in `instrument.js` before Express, Socket.IO, and pino load, each only when its variable is set
- [x] 2.2 Wrap message processing in a `chat.procesar_mensaje` span with the `chat.mensajes` counter and the `chat.mensaje.duracion` histogram, and log each result with pino
- [x] 2.3 Add the `/fallo` controlled failure behind `CHAT_FALLO_CONTROLADO=true`
- [x] 2.4 Add `.env.example` with empty keys

## 3. Local runs

- [x] 3.1 Add `Dockerfile`, `.dockerignore`, and `docker-compose.yml`
- [x] 3.2 Add `artillery/carga.yml` for 5 requests per second over 60 seconds to `POST /api/mensajes`

## 4. Verification

- [x] 4.1 Run the Mocha unit tests, the Jest integration tests, and the Playwright end-to-end tests
- [x] 4.2 Confirm traces, metrics, and logs leave the process with a local OTLP receiver
