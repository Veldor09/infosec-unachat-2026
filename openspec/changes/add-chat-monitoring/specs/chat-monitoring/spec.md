## Purpose

Defines how the chat exposes its availability, accepts messages over HTTP, reports errors, and exports telemetry, without changing how messages are validated or shown.

## ADDED Requirements

### Requirement: Health route
The server MUST answer `GET /health` with status 200 and the body `{ "estado": "ok" }` while it is running.

#### Scenario: Uptime check
- **WHEN** a monitor requests `/health`
- **THEN** the response status is 200
- **THEN** the body is `{ "estado": "ok" }`

### Requirement: HTTP message endpoint
The server MUST accept `POST /api/mensajes` with a JSON body `{ nombre, mensaje, color }`, validate it with the same rules as the socket event, answer 201 with the validated message, and broadcast that message on `Evento-Mensaje-Server`. A body without a text `mensaje` or with malformed JSON MUST be answered with 400 and MUST NOT be broadcast.

#### Scenario: Plain message over HTTP
- **WHEN** a client posts `{ "nombre": "Ana", "mensaje": "hola", "color": "#112233" }`
- **THEN** the response status is 201 with that message
- **THEN** every connected socket receives the same message on `Evento-Mensaje-Server`

#### Scenario: Script over HTTP
- **WHEN** a client posts a message containing `<script>alert(1)</script>`
- **THEN** the response contains the script escaped as text

#### Scenario: Missing message
- **WHEN** a client posts a body without `mensaje`
- **THEN** the response status is 400

### Requirement: Controlled failure
When `CHAT_FALLO_CONTROLADO` is `true`, the message `/fallo` MUST raise an error on both the socket event and the HTTP endpoint; the error MUST be logged, recorded on the message span, counted as an error, and sent to Sentry when it is configured, and the message MUST NOT be broadcast. When the variable is not `true`, `/fallo` MUST be treated as an ordinary message.

#### Scenario: Failure enabled
- **WHEN** `CHAT_FALLO_CONTROLADO=true` and a client posts `/fallo`
- **THEN** the response status is 500
- **THEN** no message is broadcast

#### Scenario: Failure disabled
- **WHEN** the variable is not set and a client posts `/fallo`
- **THEN** the response status is 201 and the text is broadcast

### Requirement: Telemetry export
When `OTEL_EXPORTER_OTLP_ENDPOINT` is set, the server MUST export traces, metrics, and logs over OTLP with `service.name` and `deployment.environment` resource attributes, and each processed message MUST produce a `chat.procesar_mensaje` span and a log carrying its trace id. When the variable is empty, the server MUST NOT export telemetry. Credentials MUST come from the environment only.

#### Scenario: Local run with Grafana Cloud
- **WHEN** the server runs locally with the OTLP endpoint and header set
- **THEN** traces, metrics, and logs reach the gateway tagged `deployment.environment=local`

#### Scenario: Deployment without the endpoint
- **WHEN** the server runs on Render without `OTEL_EXPORTER_OTLP_ENDPOINT`
- **THEN** no telemetry is exported
