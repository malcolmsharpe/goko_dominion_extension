$(document).ready(function() {var main = function() {
  // Note: The above line is a single line in order to get accurate
  // line numbers for error messages.

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
  function prettyJSON(msg) {
    return JSON.stringify(msg, null, 4);
  }

  function onSendData(raw_data) {
    processRawData(raw_data);
  }

  function onReceiveData(raw_data) {
    processRawData(raw_data);
  }

  var playerNames = undefined;

  function processRawData(raw_data) {
    var msg = $.parseJSON(raw_data);
    if (msg.message == 'GameMessage') {
      var outerdata = msg.data;
      var msgname = outerdata.messageName;
      var gmdata = outerdata.data;
      
      if (msgname == 'gameSetup') {
        // Get correspondence between player names and player indices.
        playerNames = [];
        $.each(gmdata.playerInfos, function(i, playerInfo) {
          playerNames[i] = playerInfo.name;
        });

        console.log('Players: ' + prettyJSON(playerNames));

        // TODO: Maybe initialize starting decks here.
      } else if (msgname == 'moveCards') {
        // Process a card move that is NOT triggered by this player's input.
        $.each(gmdata, function(i, moveData) {
          // moveCard and destinationCard sometimes have the value "back",
          // but (so far) sourceCard always shows what the card is.
          var card = moveData.sourceCard;
          if (card == 'back') {
            console.log('ERROR: Unknown moved card for move data: ' + prettyJSON(moveData));
            return;
          }

          processMove(card, moveData.source, moveData.destination);
        });
      } else if (msgname == 'uiMultiSelectResponse') {
        if (gmdata.card != undefined) {
          // Process a card move that IS triggered by this player's input.
          processMove(gmdata.card, gmdata.source, gmdata.destination);
        } else if (gmdata.id == 'done' || gmdata.id == 'playAll') {
          // Pressed the "Done" or "Play Treasures" button.
          // The treasure plays come in as moveCards messages, so we don't need
          // to do anything here.
        } else {
          console.log('ERROR: Unrecognized uiMultiSelectResponse: ' + prettyJSON(gmdata));
        }
      }
    }
  }

  function prettyArea(area) {
    var data = area.area;

    var player;
    if (data.playerIndex != undefined) player = playerNames[data.playerIndex];

    if (data.name == 'trash') return 'trash';
    else if (data.name == 'play') return 'play';
    else if (data.name == 'supply') return 'supply (' + data.supplyDeck + ')';
    else if (data.name == 'discard') return 'discard (' + player + ')';
    else if (data.name == 'hand') return 'hand (' + player + ')';
    else if (data.name == 'deck') return 'deck (' + player + ')';
    else if (data.name == 'globalReveal') return 'globalReveal';
    else if (data.name == 'reveal') return 'reveal (' + player + ')';
    else {
      console.log('ERROR: Unknown area: ' + prettyJSON(data));
      return 'ERROR';
    }
  }

  function processMove(card, src, dst) {
    console.log('Move ' + card + ' from ' + prettyArea(src) + ' to ' + prettyArea(dst));
  }
}

// Boilerplate to run in page context (important for hooking the websocket).
var runInPageContext = function(fn) {
  var script = document.createElement('script');
  script.type = 'text/javascript';
  script.textContent = '('+ fn +')();';
  document.body.appendChild(script);
}

runInPageContext(main);

})
