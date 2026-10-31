# Laboratorio 7: monitoreo de UNA Chat

Cronitor y Sentry sobre el chat desplegado en Render (parte 1), telemetría local a Grafana Cloud (parte 2) y Docker con Artillery (parte 3).

> El enunciado menciona Vercel. Este proyecto se despliega en Render desde el laboratorio 6, así que la parte 1 se hace sobre `https://infosec-unachat-2026-x8p9.onrender.com`. Render no recibe `OTEL_EXPORTER_OTLP_ENDPOINT`: el despliegue no envía logs, métricas ni trazas a Grafana.

## Integración elegida

| Necesidad | Herramienta | Dónde |
|---|---|---|
| Disponibilidad | Cronitor (monitor HTTP a `/health`) | Render |
| Errores | Sentry, SDK `@sentry/node` | Render y local |
| Trazas, métricas y logs | OpenTelemetry Node SDK, OTLP `http/protobuf` directo al gateway de Grafana Cloud (sin Alloy ni collector) | Local y Docker |
| Logs | pino; la instrumentación de OpenTelemetry agrega `trace_id`/`span_id` y los envía a Loki | Local y Docker |
| Carga | Artillery, ejecutado en el equipo | Docker local |

Recorrido de los datos: el chat procesa un mensaje (Socket.IO o `POST /api/mensajes`) → crea el span `chat.procesar_mensaje`, suma `chat.mensajes`, registra `chat.mensaje.duracion` y escribe un log con el mismo `trace_id` → el SDK agrupa y envía por OTLP al gateway `https://otlp-gateway-<región>.grafana.net/otlp` → Grafana Cloud guarda las trazas en Tempo, los logs en Loki y las métricas en Mimir (Prometheus) → se consultan en Explore con `service_name="una-chat"` y `deployment_environment="local"`.

## Variables

Copie `.env.example` a `.env` y complete los valores (ver comentarios en el archivo). `.env` está en `.gitignore`.

| Variable | Render | Local / Docker |
|---|---|---|
| `SENTRY_DSN` | sí | sí |
| `CHAT_FALLO_CONTROLADO` | `true` solo mientras se prueba Sentry; luego se elimina | `true` durante la prueba del fallo |
| `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS` | **no** | sí |
| `OTEL_RESOURCE_ATTRIBUTES` | no | `deployment.environment=local` |

## Comandos

```powershell
npm ci
npm start                                  # chat en http://localhost:3000
npm test                                   # Mocha
npm run test:integration                   # Jest
npm run test:e2e                           # Playwright
```

Docker (Docker Desktop abierto):

```powershell
docker compose up -d --build
docker compose ps
docker compose logs -f una-chat
docker compose down
```

Artillery (instalado en el equipo con `npm install -g artillery`):

```powershell
artillery run artillery/carga.yml --output artillery/reporte.json
```

Error controlado: con `CHAT_FALLO_CONTROLADO=true`, escriba `/fallo` en el chat (o `POST /api/mensajes` con `"mensaje": "/fallo"`). El mensaje no se publica, la API responde 500 y el error llega a Sentry, a los logs (nivel error), a la traza (estado error) y a la métrica `chat.mensajes{resultado="error"}`.

## Consultas en Grafana Cloud (Explore)

| Señal | Consulta |
|---|---|
| Logs (Loki) | `{service_name="una-chat", deployment_environment="local"}` |
| Solo errores | `{service_name="una-chat", deployment_environment="local"} \| json \| level="50"` o filtre por `severity_text="error"` |
| Logs de una traza | `{service_name="una-chat"} \|= "<trace_id>"` |
| Trazas (Tempo, TraceQL) | `{resource.service.name="una-chat" && name="chat.procesar_mensaje"}` |
| Trazas fallidas | `{resource.service.name="una-chat" && status=error}` |
| Mensajes por resultado | `sum by (resultado) (rate(chat_mensajes_total{deployment_environment="local"}[1m]))` |
| Latencia p95 | `histogram_quantile(0.95, sum by (le) (rate(chat_mensaje_duracion_milliseconds_bucket[1m])))` |
| Solicitudes HTTP por estado | busque `http_server` en el explorador de métricas y agrupe por `http_response_status_code` |

Los nombres exactos de las métricas HTTP dependen de la versión de la instrumentación; el explorador de métricas los muestra al escribir `http_server`.

## Evidencias que pide el enunciado

Oculte siempre el token de Grafana, el DSN de Sentry y cualquier clave.

### Parte 1: Cronitor y Sentry (Render)

1. Monitor de Cronitor con la URL de Render (`/health`), su criterio de disponibilidad (código 200) y el estado y tiempo de respuesta.
2. Configuración de notificaciones de Cronitor (destinatario de alertas).
3. Evento de Sentry generado desde Render con `/fallo`: título, entorno `render`, stack trace y etiqueta `canal`. Explicar cómo ayuda a encontrar el problema.
4. Evidencia de que se retiró el mecanismo: `CHAT_FALLO_CONTROLADO` eliminada en Render y `/fallo` publicado como texto normal.

### Parte 2: telemetría local en Grafana Cloud

5. Explicación de logs, métricas y trazas con un ejemplo del chat, y el papel de Grafana, Loki y Tempo (texto).
6. Ejecución local (`npm start`) con la terminal visible.
7. Logs en Loki filtrados por `una-chat`, `deployment_environment="local"` y el intervalo de la prueba, con mensajes correctos y el error de `/fallo`.
8. Métricas: mensajes por resultado (ok/error) y tiempo de respuesta.
9. Trazas en Tempo: una correcta y una con estado de error.
10. Breve explicación del recorrido de los datos (sección anterior).

### Parte 3.1: prueba funcional en Docker

11. `docker compose ps` con el contenedor `una-chat` en ejecución y la conversación en `http://localhost:3000`, con hora de inicio y fin anotadas.
12. Logs en Loki filtrados por servicio, entorno local e intervalo (con `app_ejecucion="docker"` si aparece como etiqueta o metadato).
13. Detalle de una traza (spans, duración, resultado) y un log con el mismo `trace_id`.
14. `Dockerfile`, `docker-compose.yml`, `.env.example` (sin credenciales) y los comandos de este archivo.

### Parte 3.2: carga con Artillery

15. Cuenta de Artillery y `artillery/carga.yml` con el destino local visible.
16. Comando ejecutado y reporte: solicitudes, tasa observada, p50, p95, códigos y errores; horas de inicio y fin.
17. Logs y gráficos de Grafana Cloud en el mismo intervalo: tasa de solicitudes, latencia y errores.
18. Conclusión: 300 previstas contra el resultado real, diferencias y efecto en latencia y errores.

## Resultados obtenidos (30/10/2026, hora de Costa Rica)

### Parte 1
- Sentry recibió `FalloControlado: Fallo controlado de prueba (comando /fallo)` desde Render: `environment=render`, `release=9f2ecbc`, etiqueta `canal=socket`, stack trace en `server.js:23`. Luego se eliminó `CHAT_FALLO_CONTROLADO` en Render y `/fallo` volvió a publicarse como texto.
- Cronitor: monitor `UNA Chat (Render) - /health`, GET cada 5 min, timeout 30 s, aserción `response.code = 200`, tolerancia de 1 fallo, alertas a la lista Default (correo del estudiante). Estado Healthy, 100 % de disponibilidad, ~486 ms de respuesta.

### Parte 2 (chat local con `npm start`, 18:56:14 – 18:56:42)
- 4 mensajes correctos y `/fallo` por Socket.IO; 5 correctos, 1 inválido y 2 `/fallo` por HTTP.
- Loki: 23 líneas (18 info, 5 error) de `una-chat` con `deployment_environment=local`.
- Mimir: `chat_mensajes_total` http 5 ok / 2 error, socket 4 ok / 1 error; HTTP 201 = 5, 400 = 1, 500 = 2.
- Tempo: 16 trazas; la de `/fallo` termina en 500 con el span `chat.procesar_mensaje` en estado error.

### Parte 3.1 (Docker, 19:07:52 – 19:08:16)
- Contenedor `una-chat` (imagen `una-chat:lab7`, puerto 3000) en estado healthy; 6 mensajes (texto, imagen, YouTube y script escapado).
- Loki con `app_ejecucion="docker"`: 14 líneas. Traza `3c7c273fd4eb5775142c6ff97e35677d` con spans `receive /` → `chat.procesar_mensaje` → `send /`; su log comparte el mismo `trace_id`; `process.command=/app/server.js` confirma que corre en el contenedor.

### Parte 3.2 (Artillery contra Docker, 19:18:37 – 19:19:36)
Comando: `npx artillery@2.0.34 run artillery/carga.yml --output artillery/reporte.json` (reporte guardado en `artillery/reporte.json`).

| Métrica | Valor |
|---|---|
| Solicitudes previstas / realizadas | 300 / 300 |
| Tasa observada | 5 solicitudes/s |
| Códigos | 201 × 300 |
| Errores / tiempos de espera | 0 / 0 |
| Latencia (Artillery) | min 4 ms · p50 10.1 ms · p95 16 ms · p99 22.9 ms · max 46 ms |
| Latencia en el servidor (Grafana) | p50 ≈ 3.4 ms · p95 ≈ 9 ms |
| Logs en Loki (ruta `/api/mensajes`) | 300 líneas, 5 por segundo, todas info |

**Conclusión.** Se enviaron las 300 solicitudes previstas (5/s durante 60 s) y las 300 respondieron 201: no hubo diferencia entre lo previsto y lo real, ni errores ni tiempos de espera. La latencia se mantuvo estable durante toda la carga (p95 de 16 ms medido por Artillery y de ~9 ms en el servidor). La diferencia entre ambas mediciones corresponde al tiempo de red y del cliente, que Artillery incluye y el servidor no. A 5 solicitudes por segundo el chat en Docker no muestra degradación. La primera ventana del reporte marca 10 solicitudes/s porque Artillery agrupa por períodos de 10 s y la prueba empezó a mitad de uno; el total y el promedio son exactamente 5/s.
