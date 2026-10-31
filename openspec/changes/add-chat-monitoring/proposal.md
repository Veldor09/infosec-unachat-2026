## Why

Lab 7 asks for availability checks, error tracking, and logs, metrics, and traces for the chat. Today the server only prints to the console, so there is no way to see from outside whether the chat is up, which messages failed, or how a load test affected response times. A load test also needs an HTTP endpoint that processes messages; the chat only accepts them over Socket.IO.

## What Changes

- Add `GET /health` so an uptime monitor (Cronitor) can check the deployed chat.
- Add `POST /api/mensajes`, which validates a `{ nombre, mensaje, color }` body with the same `libs/unalib.js` logic as the socket event and broadcasts the result on `Evento-Mensaje-Server`.
- Report server errors to Sentry when `SENTRY_DSN` is set.
- Export traces, metrics, and logs over OTLP (`http/protobuf`) to Grafana Cloud when `OTEL_EXPORTER_OTLP_ENDPOINT` is set, tagged with `service.name` and `deployment.environment`. Render does not set it, so the deployment sends nothing to Grafana.
- Add a controlled failure: when `CHAT_FALLO_CONTROLADO=true`, the message `/fallo` raises an error on either channel. Without the variable the command is an ordinary message.
- Add a Dockerfile, `docker-compose.yml`, and an Artillery script for a local load test against the container.

## Capabilities

### New Capabilities

- `chat-monitoring`: Health route, HTTP message endpoint, error reporting, telemetry export, and the controlled failure.

### Modified Capabilities

## Impact

- `server.js` loads `instrument.js` first and gains the two routes. New `libs/monitoreo.js` for the logger, the message span, and the message metrics.
- New runtime dependencies: `@sentry/node`, `pino`, `dotenv`, and the OpenTelemetry Node SDK with OTLP proto exporters.
- The socket event name, the message JSON, and `libs/unalib.js` validation stay as they are. The page does not change.
- Credentials live only in `.env` (gitignored) or the platform environment. `.env.example` lists the keys with empty values.
