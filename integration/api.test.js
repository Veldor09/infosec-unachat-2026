var server = require('../server');
var io = require('socket.io-client').io;

var clients = [];
var base;

function connect(port) {
  return new Promise(function (resolve, reject) {
    var socket = io('http://127.0.0.1:' + port, {
      transports: ['websocket'],
      forceNew: true
    });
    var timer = setTimeout(function () {
      reject(new Error('socket connection timed out'));
    }, 5000);

    clients.push(socket);
    socket.on('connect', function () {
      clearTimeout(timer);
      resolve(socket);
    });
  });
}

function nextMessage(socket) {
  return new Promise(function (resolve, reject) {
    var timer = setTimeout(function () {
      reject(new Error('did not receive a chat message'));
    }, 5000);

    socket.once('Evento-Mensaje-Server', function (msg) {
      clearTimeout(timer);
      resolve(JSON.parse(msg));
    });
  });
}

function postMessage(body, raw) {
  return fetch(base + '/api/mensajes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw ? body : JSON.stringify(body)
  });
}

describe('Chat HTTP API', function () {
  var port;

  beforeAll(function (done) {
    server.listen(0, '127.0.0.1', function () {
      port = server.address().port;
      base = 'http://127.0.0.1:' + port;
      done();
    });
  });

  afterEach(function () {
    delete process.env.CHAT_FALLO_CONTROLADO;
    while (clients.length) {
      clients.pop().close();
    }
  });

  afterAll(function (done) {
    server.close(done);
  });

  describe('when Cronitor checks the health route', function () {
    it('should answer 200 with an ok status', async function () {
      var response = await fetch(base + '/health');

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ estado: 'ok' });
    });
  });

  describe('when a client posts a plain message', function () {
    it('should answer 201 and broadcast it on the chat event', async function () {
      var receiver = await connect(port);
      var received = nextMessage(receiver);

      var response = await postMessage({ nombre: 'Ana', mensaje: 'hola', color: '#112233' });
      var body = await response.json();
      var broadcast = await received;

      expect(response.status).toBe(201);
      expect(body).toEqual({ nombre: 'Ana', mensaje: 'hola', color: '#112233' });
      expect(broadcast).toEqual(body);
    });
  });

  describe('when a client posts a script tag', function () {
    it('should answer with the script escaped', async function () {
      var response = await postMessage({ nombre: '<script>x</script>', mensaje: '<script>alert(1)</script>' });
      var body = await response.json();

      expect(response.status).toBe(201);
      expect(body.nombre).not.toContain('<script>');
      expect(body.mensaje).toContain('&lt;script&gt;');
      expect(body.color).toBe('#000000');
    });
  });

  describe('when a client posts an image url', function () {
    it('should answer with an image tag', async function () {
      var response = await postMessage({ nombre: 'Ana', mensaje: 'http://image.com/image.jpg' });
      var body = await response.json();

      expect(response.status).toBe(201);
      expect(body.mensaje).toContain('<img src="http://image.com/image.jpg"');
    });
  });

  describe('when the body has no message', function () {
    it('should answer 400', async function () {
      var response = await postMessage({ nombre: 'Ana' });

      expect(response.status).toBe(400);
    });
  });

  describe('when the body is not valid JSON', function () {
    it('should answer 400', async function () {
      var response = await postMessage('{malformado', true);

      expect(response.status).toBe(400);
    });
  });

  describe('when the controlled failure is enabled', function () {
    it('should answer 500 for the /fallo command and not broadcast it', async function () {
      process.env.CHAT_FALLO_CONTROLADO = 'true';
      var receiver = await connect(port);
      var broadcasts = 0;
      receiver.on('Evento-Mensaje-Server', function () { broadcasts++; });

      var response = await postMessage({ nombre: 'Ana', mensaje: '/fallo' });
      await new Promise(function (resolve) { setTimeout(resolve, 300); });

      expect(response.status).toBe(500);
      expect(broadcasts).toBe(0);
    });
  });

  describe('when the controlled failure is disabled', function () {
    it('should treat /fallo as a normal message', async function () {
      var response = await postMessage({ nombre: 'Ana', mensaje: '/fallo' });
      var body = await response.json();

      expect(response.status).toBe(201);
      expect(body.mensaje).toBe('/fallo');
    });
  });
});
