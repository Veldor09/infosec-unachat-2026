# Monitoreo

**TLDR:** `instrument.js` va primero en `server.js`. Sentry solo con `SENTRY_DSN`; Grafana solo con `OTEL_EXPORTER_OTLP_ENDPOINT` (nunca en Render). Credenciales en `.env`, nunca en el código ni en capturas.

`server.js` hace `require('./instrument')` antes que Express, Socket.IO y pino. Si se mueve después, la instrumentación de pino no agrega `trace_id` ni envía los logs, y no hay spans HTTP.

| Variable | Efecto |
|---|---|
| `SENTRY_DSN` | Activa Sentry. Se configura en Render y en `.env`. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Activa la exportación OTLP a Grafana Cloud. Solo en local o Docker. Termina en `/otlp`. |
| `OTEL_EXPORTER_OTLP_HEADERS` | `Authorization=Basic%20<base64>`, sin comillas y con `%20`. |
| `OTEL_RESOURCE_ATTRIBUTES` | `deployment.environment=local`. |
| `CHAT_FALLO_CONTROLADO` | `true` convierte el mensaje `/fallo` en un error (socket y HTTP). Quitarla retira el mecanismo. |
| `CHAT_EJECUCION` | Atributo `app.ejecucion`: `docker` en `docker-compose.yml`, `node` por defecto. |

Señales: span `chat.procesar_mensaje` (atributos `chat.canal`, `chat.tipo`, `chat.resultado`), contador `chat.mensajes`, histograma `chat.mensaje.duracion` (ms), métricas HTTP automáticas y logs de pino con `trace_id`. El sondeo `/socket.io/` no se traza, y tampoco las llamadas al gateway ni a Sentry.

Para probar la exportación sin credenciales, apunta `OTEL_EXPORTER_OTLP_ENDPOINT` a un receptor HTTP local y revisa que lleguen `POST /otlp/v1/traces`, `/v1/metrics` y `/v1/logs`.

`POST /api/mensajes` existe para Artillery: aplica la misma validación que el evento y reenvía por `Evento-Mensaje-Server`. `artillery/carga.yml` apunta a `http://localhost:3000` (el contenedor), nunca a Render.
