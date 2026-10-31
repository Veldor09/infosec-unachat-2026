// Monitoreo del chat. server.js lo carga antes que express, http, socket.io y pino,
// porque Sentry y OpenTelemetry deben iniciarse antes de que se carguen esos modulos.
//
// - Sentry: solo si existe SENTRY_DSN (Render o local).
// - OpenTelemetry a Grafana Cloud: solo si existe OTEL_EXPORTER_OTLP_ENDPOINT. Render no lo define,
//   asi que el despliegue no envia logs, metricas ni trazas a Grafana.
// Las credenciales llegan por variables de entorno (.env en local, nunca en el codigo).

require('dotenv').config({ quiet: true });

var Sentry = require('@sentry/node');

// "local" salvo que OTEL_RESOURCE_ATTRIBUTES o CHAT_ENTORNO digan otra cosa
function leerEntorno() {
  var atributos = (process.env.OTEL_RESOURCE_ATTRIBUTES || '').split(',');
  for (var i = 0; i < atributos.length; i++) {
    var par = atributos[i].split('=');
    if (par[0].trim() === 'deployment.environment' && par[1]) {
      return par[1].trim();
    }
  }
  return process.env.CHAT_ENTORNO || (process.env.RENDER ? 'render' : 'local');
}

var entorno = leerEntorno();
var servicio = process.env.OTEL_SERVICE_NAME || 'una-chat';
var sentryDsn = (process.env.SENTRY_DSN || '').trim();
var otlpEndpoint = (process.env.OTEL_EXPORTER_OTLP_ENDPOINT || '').trim();

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: process.env.SENTRY_ENVIRONMENT || entorno,
    release: process.env.RENDER_GIT_COMMIT || undefined,
    sendDefaultPii: false
  });
}

var sdk = null;

if (otlpEndpoint) {
  var NodeSDK = require('@opentelemetry/sdk-node').NodeSDK;
  var getNodeAutoInstrumentations = require('@opentelemetry/auto-instrumentations-node').getNodeAutoInstrumentations;
  var OTLPTraceExporter = require('@opentelemetry/exporter-trace-otlp-proto').OTLPTraceExporter;
  var OTLPMetricExporter = require('@opentelemetry/exporter-metrics-otlp-proto').OTLPMetricExporter;
  var OTLPLogExporter = require('@opentelemetry/exporter-logs-otlp-proto').OTLPLogExporter;
  var PeriodicExportingMetricReader = require('@opentelemetry/sdk-metrics').PeriodicExportingMetricReader;
  var BatchLogRecordProcessor = require('@opentelemetry/sdk-logs').BatchLogRecordProcessor;
  var resourceFromAttributes = require('@opentelemetry/resources').resourceFromAttributes;

  // no trazar los envios a Grafana ni a Sentry: generarian spans de la propia exportacion
  var hostsIgnorados = [new URL(otlpEndpoint).hostname];
  if (sentryDsn) {
    hostsIgnorados.push(new URL(sentryDsn).hostname);
  }

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      'service.name': servicio,
      'deployment.environment': entorno,
      'deployment.environment.name': entorno,
      // "docker" cuando corre con docker compose, "node" cuando se inicia con npm start
      'app.ejecucion': process.env.CHAT_EJECUCION || 'node'
    }),
    // los exportadores leen OTEL_EXPORTER_OTLP_ENDPOINT y OTEL_EXPORTER_OTLP_HEADERS
    traceExporter: new OTLPTraceExporter(),
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter(),
        exportIntervalMillis: Number(process.env.OTEL_METRIC_EXPORT_INTERVAL) || 15000
      })
    ],
    logRecordProcessors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() })],
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-http': {
          // el sondeo de Socket.IO llena las trazas sin aportar; los mensajes tienen su propio span
          ignoreIncomingRequestHook: function (req) {
            return (req.url || '').indexOf('/socket.io/') === 0;
          },
          ignoreOutgoingRequestHook: function (req) {
            var host = req.hostname || String(req.host || '').split(':')[0];
            return hostsIgnorados.indexOf(host) !== -1;
          }
        },
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false }
      })
    ]
  });
  sdk.start();
}

// al detener el proceso (Ctrl+C o docker compose down) se envia lo pendiente
var cerrando = false;
function cerrar() {
  if (cerrando) return;
  cerrando = true;
  Promise.allSettled([
    sdk ? sdk.shutdown() : null,
    sentryDsn ? Sentry.close(2000) : null
  ]).then(function () {
    process.exit(0);
  });
}

if (sdk || sentryDsn) {
  process.on('SIGTERM', cerrar);
  process.on('SIGINT', cerrar);
}

module.exports = {
  entorno: entorno,
  servicio: servicio,
  sentryActivo: Boolean(sentryDsn),
  otelActivo: Boolean(sdk)
};
