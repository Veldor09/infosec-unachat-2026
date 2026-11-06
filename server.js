
// npm install para descargar los paquetes...

// monitoreo primero: Sentry y OpenTelemetry deben cargarse antes que express y socket.io.
// instrument.js tambien carga el .env.
require('./instrument');

var path = require('path');
var Sentry = require('@sentry/node');
var express = require('express');
var validation = require('./libs/unalib');
var monitoreo = require('./libs/monitoreo');
var authGate = require('./server/auth');
var vault = require('./server/vault');

var app = express();
app.set('trust proxy', 1);
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

app.get('/', function (req, res) {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// disponibilidad para Cronitor
app.get('/health', function (req, res) {
  res.json({ estado: 'ok' });
});

// mismo procesamiento que el evento de Socket.IO, por HTTP (lo usa Artillery).
// Con el login de Auth0 activo no pasa por la sesion, asi que se cierra: los mensajes
// entran por el chat, que si exige el ID token.
app.post('/api/mensajes', express.json({ limit: '16kb' }), function (req, res) {
  if (authGate.authSettings()) {
    return res.status(403).json({ error: 'Con el inicio de sesion activo los mensajes entran por el chat.' });
  }

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

app.get('/auth/config', function (req, res) {
  var settings = authGate.authSettings();
  if (!settings) {
    res.json({ enabled: false });
    return;
  }
  res.json({
    enabled: true,
    domain: settings.domain,
    clientId: settings.clientId
  });
});

app.get('/auth/login', function (req, res) {
  if (!authGate.authSettings()) {
    res.status(404).json({ error: 'Login is disabled.' });
    return;
  }
  authGate.beginLogin(req, res);
});

app.get('/auth/callback', function (req, res) {
  if (!authGate.authSettings()) {
    res.redirect('/');
    return;
  }
  authGate.finishLogin(req, res);
});

app.get('/auth/logout', function (req, res) {
  authGate.logout(req, res);
});

app.get('/sala', function (req, res) {
  if (!authGate.authSettings()) {
    res.json({ enabled: false });
    return;
  }
  authGate.readSession(req, res);
});

app.get('/profile.js', function (req, res) {
  res.sendFile(path.join(__dirname, 'libs', 'profile.js'));
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

io.use(function (socket, next) {
  if (!authGate.authSettings()) {
    next();
    return;
  }
  authGate.authorizeSocket(socket, next);
});

// escuchar una conexion por socket
io.on('connection', function (socket) {
  // si se escucha "chat message"
  socket.on('Evento-Mensaje-Server', function (msg) {
    if (socket.data && socket.data.user && socket.data.user.name) {
      msg = authGate.stampSender(msg, socket.data.user.name);
    }
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

// Con AUTH0_DOMAIN y AUTH0_CLIENT_ID el secreto se lee de Supabase Vault antes de abrir el puerto.
function boot() {
  if (!authGate.authSettings()) return Promise.resolve();
  if (process.env.AUTH0_CLIENT_SECRET) {
    logger.warn('AUTH0_CLIENT_SECRET is set and is ignored. The client secret is loaded from Supabase Vault.');
  }
  return vault.loadAuth0ClientSecret().then(function (secret) {
    return authGate.initAuth0(secret).catch(function (err) {
      var message = err && err.message ? String(err.message) : '';
      if (message.indexOf('Auth0 ') === 0 && message.length < 120) throw new Error(message);
      throw new Error(vault.redact(message, secret));
    });
  });
}

if (require.main === module) {
  boot().then(function () {
    http.listen(port, function () {
      logger.info({ puerto: port }, 'listening on *:' + port);
    });
  }).catch(function (err) {
    logger.error(err && err.message ? err.message : 'Auth0 startup failed.');
    // da tiempo a enviar el aviso a Sentry antes de salir
    Sentry.flush(2000).then(function () {
      process.exit(1);
    }, function () {
      process.exit(1);
    });
  });
}

module.exports = http;
