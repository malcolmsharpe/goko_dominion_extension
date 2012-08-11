$(document).ready(function() {

// Boilerplate to run in page context (important for hooking the websocket).
var runInPageContext = function(fn) {
  var script = document.createElement('script');
  script.type = 'text/javascript';
  script.textContent = '('+ fn +')();';
  document.body.appendChild(script);
}

var main = function() {
  // Boilerplate to read websocket traffic.
  function hookWebSocket() {
    // Adapted from: http://sla.ckers.org/forum/read.php?6,35771,35771
    window.WebSocket = function(oldWebSocket) {
      return function WrappedWebSocket(loc) {
        this.prototype = new oldWebSocket(loc);
        this.__proto__ = this.prototype;
        var wrapper = this;
        this.onmessage = function(message) {
          var data = message.data;
          onReceiveData(data);
          wrapper.trueonmessage({data: data});
        };
        this.__defineSetter__('onmessage', function(val) {
          wrapper.trueonmessage = val;
        });
        this.send = function(data) {
          onSendData(data);
          this.prototype.send(data);
        };
      };
    }(window.WebSocket);
  }

  hookWebSocket();

  // Actually do stuff now.
  function onSendData(data) {
  }

  function prettyJSON(msg) {
    return JSON.stringify(msg, null, 4);
  }

  function onReceiveData(data) {
    msg = $.parseJSON(data);
    if (msg.message == 'GameMessage') {
      console.log('Receiving: ' + prettyJSON(msg));
    }
  }
}

runInPageContext(main);

})
