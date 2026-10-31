
// npm install para descargar los paquetes...

// monitoreo primero: Sentry y OpenTelemetry deben cargarse antes que express y socket.io
require('./instrument');

// libreriuas
var Sentry = require('@sentry/node');
var validation = require('./libs/unalib');
var monitoreo = require('./libs/monitoreo');
var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var port = process.env.PORT || 3000;
var logger = monitoreo.logger;

// error de prueba para Sentry y Grafana. Solo existe si CHAT_FALLO_CONTROLADO=true;
// para retirarlo basta con quitar la variable.
var COMANDO_FALLO = '/fallo';

function FalloControlado() {
  var error = new Error('Fallo controlado de prueba (comando ' + COMANDO_FALLO + ')');
  error.name = 'FalloControlado';
  return error;
}

function falloControladoActivo() {
  return process.env.CHAT_FALLO_CONTROLADO === 'true';
}

function tipoDeMensaje(mensajeValidado) {
  if (mensajeValidado.indexOf('<img') === 0) return 'imagen';
  if (mensajeValidado.indexOf('<iframe') === 0) return 'video';
  return 'texto';
}

// valida el mensaje con una-lib dentro de un span y devuelve el JSON que se reenvia al chat
function procesarMensaje(msg, canal) {
  return monitoreo.medirMensaje(canal, function () {
    var original = {};
    try {
      original = JSON.parse(msg) || {};
    } catch (e) {
      // un JSON invalido lo resuelve validateMessage escapandolo
    }

    if (falloControladoActivo() && typeof original.mensaje === 'string' && original.mensaje.trim() === COMANDO_FALLO) {
      throw FalloControlado();
    }

    var validado = validation.validateMessage(msg);
    return { json: validado, tipo: tipoDeMensaje(JSON.parse(validado).mensaje || '') };
  });
}

// registra cada solicitud HTTP (menos el sondeo de Socket.IO) con su estado y duracion
app.use(function (req, res, next) {
  if (req.path.indexOf('/socket.io/') === 0) {
    return next();
  }
  var inicio = process.hrtime.bigint();
  res.on('finish', function () {
    var datos = {
      metodo: req.method,
      ruta: req.path,
      estado: res.statusCode,
      duracion_ms: Number(process.hrtime.bigint() - inicio) / 1e6
    };
    if (res.statusCode >= 500) {
      logger.error(datos, 'Solicitud HTTP fallida');
    } else {
      logger.info(datos, 'Solicitud HTTP');
    }
  });
  next();
});

// root: presentar html
app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
});

// disponibilidad para Cronitor
app.get('/health', function (req, res) {
  res.json({ estado: 'ok' });
});

// mismo procesamiento que el evento de Socket.IO, por HTTP (lo usa Artillery)
app.post('/api/mensajes', express.json({ limit: '16kb' }), function (req, res) {
  var cuerpo = req.body || {};
  if (typeof cuerpo.mensaje !== 'string' || cuerpo.mensaje.trim() === '') {
    return res.status(400).json({ error: 'El cuerpo debe incluir "mensaje" como texto' });
  }

  var resultado;
  try {
    resultado = procesarMensaje(JSON.stringify({
      nombre: cuerpo.nombre,
      mensaje: cuerpo.mensaje,
      color: cuerpo.color
    }), 'http');
  } catch (error) {
    return res.status(500).json({ error: 'No se pudo procesar el mensaje' });
  }

  io.emit('Evento-Mensaje-Server', resultado.json);
  res.status(201).json(JSON.parse(resultado.json));
});

// JSON mal formado: 400. Cualquier otro error: 500 y aviso a Sentry.
app.use(function (err, req, res, next) {
  if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
    return res.status(err.status || 400).json({ error: 'Cuerpo JSON invalido' });
  }
  Sentry.captureException(err);
  logger.error({ err: err }, 'Error no controlado');
  res.status(500).json({ error: 'Error interno' });
});

// escuchar una conexion por socket
io.on('connection', function(socket){
  // si se escucha "chat message"
  socket.on('Evento-Mensaje-Server', function(msg){
    var resultado;
    try {
      resultado = procesarMensaje(msg, 'socket');
    } catch (error) {
      // ya quedo registrado en logs, trazas, metricas y Sentry; no se reenvia
      return;
    }
    // volvemos a emitir el mismo mensaje
    io.emit('Evento-Mensaje-Server', resultado.json);
  });
});

if (require.main === module) {
  http.listen(port, function(){
    logger.info({ puerto: port }, 'listening on *:' + port);
  });
}

module.exports = http;
