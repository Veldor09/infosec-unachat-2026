// Logs, metricas y trazas del procesamiento de mensajes.
// Sin OpenTelemetry activo (sin OTEL_EXPORTER_OTLP_ENDPOINT) el tracer y el meter no hacen nada
// y los logs solo salen por consola. Sin SENTRY_DSN, captureException no envia nada.

var api = require('@opentelemetry/api');
var Sentry = require('@sentry/node');
var pino = require('pino');
var instrument = require('../instrument');

// pino se carga despues de iniciar OpenTelemetry: su instrumentacion agrega trace_id y span_id
// a cada log y lo envia a Grafana Cloud (Loki)
var logger = pino({
  level: process.env.NODE_ENV === 'test' ? 'silent' : (process.env.LOG_LEVEL || 'info'),
  base: { servicio: instrument.servicio, entorno: instrument.entorno }
});

var tracer = api.trace.getTracer('una-chat');
var meter = api.metrics.getMeter('una-chat');

var mensajes = meter.createCounter('chat.mensajes', {
  description: 'Mensajes procesados por el chat, por canal, tipo y resultado',
  unit: '{mensaje}'
});

var duracion = meter.createHistogram('chat.mensaje.duracion', {
  description: 'Tiempo de procesamiento de un mensaje',
  unit: 'ms'
});

// Ejecuta fn dentro del span "chat.procesar_mensaje" y registra el resultado.
// fn devuelve { tipo } en caso de exito; si lanza un error, se registra y se vuelve a lanzar.
function medirMensaje(canal, fn) {
  return tracer.startActiveSpan('chat.procesar_mensaje', {
    attributes: { 'chat.canal': canal }
  }, function (span) {
    var inicio = process.hrtime.bigint();
    function milisegundos() {
      return Number(process.hrtime.bigint() - inicio) / 1e6;
    }

    try {
      var resultado = fn(span);
      var ms = milisegundos();

      span.setAttributes({ 'chat.tipo': resultado.tipo, 'chat.resultado': 'ok' });
      mensajes.add(1, { canal: canal, tipo: resultado.tipo, resultado: 'ok' });
      duracion.record(ms, { canal: canal, resultado: 'ok' });
      logger.info({ canal: canal, tipo: resultado.tipo, duracion_ms: ms }, 'Mensaje procesado');
      return resultado;
    } catch (error) {
      var msError = milisegundos();

      span.recordException(error);
      span.setStatus({ code: api.SpanStatusCode.ERROR, message: error.message });
      span.setAttribute('chat.resultado', 'error');
      mensajes.add(1, { canal: canal, tipo: 'desconocido', resultado: 'error' });
      duracion.record(msError, { canal: canal, resultado: 'error' });
      logger.error({ canal: canal, err: error, duracion_ms: msError }, 'Error al procesar el mensaje');
      Sentry.captureException(error, { tags: { canal: canal } });
      throw error;
    } finally {
      span.end();
    }
  });
}

module.exports = {
  logger: logger,
  medirMensaje: medirMensaje
};
