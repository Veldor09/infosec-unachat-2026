var val = require('../libs/unalib');
var expect = require('chai').expect;

function messageWith(fields) {
  return JSON.stringify(Object.assign({
    nombre: 'Ana',
    mensaje: 'hola',
    color: '#112233'
  }, fields));
}

describe('unalib', function () {

  describe('is_valid_phone', function () {

    it('should accept a phone number with a dash', function () {
      expect(val.is_valid_phone('8297-8547')).to.equal(true);
    });

    it('should reject a phone number that contains a letter', function () {
      expect(val.is_valid_phone('8297p-8547')).to.equal(false);
    });

  });

  describe('is_valid_url_image', function () {

    it('should accept an http jpg url', function () {
      expect(val.is_valid_url_image('http://image.com/image.jpg')).to.equal(true);
    });

    it('should accept an http gif url', function () {
      expect(val.is_valid_url_image('http://image.com/image.gif')).to.equal(true);
    });

  });

  describe('is_valid_yt_video', function () {

    it('should accept a youtube watch url', function () {
      expect(val.is_valid_yt_video('https://www.youtube.com/watch?v=qYwlqx-JLok')).to.equal(true);
    });

  });

  describe('script injection', function () {

    describe('when the message contains a script tag', function () {

      it('should escape the tag so it is not executable html', function () {
        var result = JSON.parse(val.validateMessage(messageWith({
          mensaje: '<script>alert(1)</script>'
        })));

        expect(result.mensaje).to.not.include('<script>');
        expect(result.mensaje).to.include('&lt;script&gt;');
      });

    });

    describe('when the username contains a script tag', function () {

      it('should escape the username', function () {
        var result = JSON.parse(val.validateMessage(messageWith({
          nombre: '<script>alert(1)</script>'
        })));

        expect(result.nombre).to.not.include('<script>');
        expect(result.nombre).to.include('&lt;script&gt;');
      });

    });

    describe('when the color breaks out of the style attribute', function () {

      it('should replace it with a safe hex color', function () {
        var result = JSON.parse(val.validateMessage(messageWith({
          color: '#fff"><script>alert(1)</script>'
        })));

        expect(result.color).to.equal('#000000');
      });

    });

    describe('when an image url uses the javascript scheme', function () {

      it('should reject the url', function () {
        expect(val.is_valid_url_image('javascript:alert(1)//.jpg')).to.equal(false);
      });

    });

    describe('when an image url hides a script tag', function () {

      it('should keep the message as text and not build an image tag', function () {
        var payload = 'http://image.com/image.jpg"><script>alert(1)</script>';
        var result = JSON.parse(val.validateMessage(messageWith({
          mensaje: payload
        })));

        expect(val.is_valid_url_image(payload)).to.equal(false);
        expect(result.mensaje).to.not.include('<script>');
        expect(result.mensaje).to.not.include('<img');
      });

    });

    describe('when a youtube url hides a script tag', function () {

      it('should reject the url and not build an iframe', function () {
        var payload = 'https://www.youtube.com/watch?v=qYwlqx-JLok"><script>alert(1)</script>';

        expect(val.is_valid_yt_video(payload)).to.equal(false);
        expect(val.getEmbeddedCode(payload)).to.not.include('<script>');
        expect(val.getEmbeddedCode(payload)).to.not.include('<iframe');
      });

    });

    describe('when the message contains an onerror handler', function () {

      it('should escape the markup', function () {
        var result = JSON.parse(val.validateMessage(messageWith({
          mensaje: '<img src=x onerror=alert(1)>'
        })));

        expect(result.mensaje).to.not.include('<img');
        expect(result.mensaje).to.include('onerror');
      });

    });

  });

});
