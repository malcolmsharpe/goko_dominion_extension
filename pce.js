$(document).ready(function() {var main = function() {
  // Note: The above line is a single line in order to get accurate
  // line numbers for error messages.

  var websocket_wrapper;

  var DIRECTION = {
    SENDING: 'sending',
    RECEIVING: 'receiving'
  };

  // Boilerplate to read and modify websocket traffic.
  function hookWebSocket() {
    // Adapted from: http://sla.ckers.org/forum/read.php?6,35771,35771
    window.WebSocket = function(oldWebSocket) {
      return function WrappedWebSocket(loc) {
        this.prototype = new oldWebSocket(loc);
        this.__proto__ = this.prototype;
        websocket_wrapper = this;
        this.onmessage = function(message) {
          var data = message.data;
          data = handleMessageHelper(data, DIRECTION.RECEIVING);
          websocket_wrapper.trueonmessage({data: data});
        };
        this.__defineSetter__('onmessage', function(val) {
          websocket_wrapper.trueonmessage = val;
        });
        this.send = function(data) {
          data = handleMessageHelper(data, DIRECTION.SENDING);
          this.prototype.send(data);
        };
      };
    }(window.WebSocket);
  }

  hookWebSocket();

  function handleMessageHelper(data, direction) {
    var ret = handleMessage(data, direction);
    if (ret != undefined) {
      console.log('Modified websocket traffic.');
      console.log('Original: ' + data);
      data = ret;
      console.log('Modified: ' + data);
    }
    return data;
  }

  // Format JSON nicely (to print to the console).
  function prettyJSON(msg) {
    return JSON.stringify(msg, null, 4);
  }

  // Main code.
  var userID;
  var gameID;

  var playerNames;
  var playerIndex;

  var PRINT_MESSAGE_TYPES = true;
  var DUMP_MESSAGES = {};
  var PRINT_GM_TYPES = true;
  var DUMP_ALL_GM = false;
  var DUMP_GM = {'resign': true, 'gameOver': true, 'gameEvent2': true};

  var CHEAT_BUYABLE = false;
  var CHEAT_SUPPLY_PLAYABLE = false;

  function handleMessage(raw_data, direction) {
    var msg = $.parseJSON(raw_data);

    var formatted_message_type = msg.message + ' (' + direction + ')';

    if (PRINT_MESSAGE_TYPES) {
      console.log('Message type: ' + formatted_message_type);
    }

    if (DUMP_MESSAGES[msg.message]) {
      console.log(formatted_message_type + ': ' + prettyJSON(msg));
    }

    var changed = false;

    if (msg.message == 'GameMessage') {
      var outerdata = msg.data;
      var msgname = outerdata.messageName;
      var gmdata = outerdata.data;

      var formatted_msgname = msgname + ' (' + direction + ')';

      if (PRINT_GM_TYPES) {
        console.log('GameMessage type: ' + formatted_msgname);
      }
      if (DUMP_ALL_GM || DUMP_GM[msgname]) {
        console.log('GameMessage ' + formatted_msgname + ': ' + prettyJSON(msg));
      }

      if (msgname == 'gameSetup') {
        // This is a reasonable time to save information that's constant
        // throughout a single game.
        userID = msg.destination;
        gameID = msg.source;
        playerIndex = gmdata.playerIndex;

        // Get correspondence between player names and player indices.
        playerNames = [];
        $.each(gmdata.playerInfos, function(i, playerInfo) {
          playerNames[i] = playerInfo.name;
        });

        console.log('Players: ' + prettyJSON(playerNames));

        // Generate the card IDs for the starting decks, since they aren't
        // reported to us directly.
        // TODO: Does this actually work reliably?
        var nextIndex = {
          'copper': 0,
          'estate': 0
        }
        $.each(gmdata.startingDecks, function(playerIndex, cards) {
          var player = playerNames[playerIndex];
          console.log('Player ' + player + ' starts with deck:');
          $.each(cards, function(j, card) {
            var qualifiedCard = card + '.' + nextIndex[card];
            ++nextIndex[card];
            console.log('  ' + qualifiedCard);
          });
        });

        // Send a greeting.
        var wait_time = 4000;
        setTimeout(introducePlugin, wait_time);
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
          var card = gmdata.card;
          if (card == 'back') {
            // The only known case where this happens is with Chancellor,
            // and it corresponds to a fake card move, not an actual one.
            // So, as long as it is consistent with a Chancellor play, ignore
            // it.
            if (gmdata.source.area.name != 'deck'
                || gmdata.destination.area.name != 'discard') {
              console.log('ERROR: Unknown moved card for response data: ' + prettyJSON(gmdata));
            }
            return;
          }
          processMove(card, gmdata.source, gmdata.destination);
        } else if (gmdata.id == 'done' || gmdata.id == 'playAll') {
          // Pressed the "Done" or "Play Treasures" button.
          // The treasure plays come in as moveCards messages, so we don't need
          // to do anything here.
        } else if (gmdata.id == 'setAside') {
          // Chose to set aside a card from Native Village.
          // This is OK, as the move is reported separately.
          // Not sure whether Library uses this, but anyway it's okay because the
          // cards remain in globalReveal.
        } else if (gmdata.id == 'take') {
          // Chose to take cards off the Native Village mat.
          // TODO: Is this triggered by any other card?
        } else {
          console.log('ERROR: Unrecognized uiMultiSelectResponse: ' + prettyJSON(gmdata));
        }
      } else if (msgname == 'updateState') {
        // This is only necessary to track VP tokens. Sometimes an updateState
        // message will not report VP tokens, and that is okay.
        var vptokens = gmdata.victoryPointTokens;
        if (vptokens != undefined) {
          setVPTokens(vptokens.playerIndex, vptokens.numVictoryPointTokens);
        }
      } else if (msgname == 'uiMultiSelect') {
        if (CHEAT_BUYABLE) {
          var what = prompt('Make buyable:');
          if (what) {
            addToBuyable(gmdata, what);
            changed = true;
          }
        }

        if (CHEAT_SUPPLY_PLAYABLE) {
          var what = prompt('Make playable from supply:');
          if (what) {
            addToSupplyPlayable(gmdata, what);
            changed = true;
          }
        }
      }
    }

    if (changed) return JSON.stringify(msg);
  }

  function addToSupplyPlayable(gmdata, card_id) {
    var arr = /([^.]*)\.([0-9]*)/.exec(card_id);
    if (arr) {
      gmdata.draggables.push({
        "id": "play:" + card_id,
        "destinations": [
          {
            "area": {
              "name": "play"
            }
          }
        ],
        "source": {
          "area": {
            "name": "supply",
            "supplyDeck": arr[1],
          }
        },
        "card": card_id,
        "moveToDestination": true
      });
    }
  }

  function addToBuyable(gmdata, card_id) {
    var arr = /([^.]*)\.([0-9]*)/.exec(card_id);
    if (arr) {
      gmdata.draggables.push({
        "id": "buy:" + card_id,
        "destinations": [
          {
            "area": {
              "playerIndex": 0,
              "name": "discard"
            }
          }
        ],
        "source": {
          "area": {
            "name": "supply",
            "supplyDeck": arr[1],
          }
        },
        "card": card_id,
        "moveToDestination": true
      });
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
    else if (data.name == 'globalRevealTwo') return 'globalRevealTwo';
    else if (data.name == 'reveal') return 'reveal (' + player + ')';
    else if (data.name == 'nativeVillageMat') return 'nativeVillageMat (' + player + ')';
    else if (data.name == 'islandMat') return 'islandMat (' + player + ')';
    else if (data.name == 'durationMat') return 'durationMat (' + player + ')';
    else {
      console.log('ERROR: Unknown area: ' + prettyJSON(data));
      return 'ERROR';
    }
  }

  function processMove(card, src, dst) {
    console.log('Move ' + card + ' from ' + prettyArea(src) + ' to ' + prettyArea(dst));
  }

  function setVPTokens(playerIndex, numVPTokens) {
    var player = playerNames[playerIndex];
    console.log('Player ' + player + ' has ' + numVPTokens + ' VP tokens');
  }

  function introducePlugin() {
    sendChat("* Cards tracked by Goko Dominion Extension *");
  }

  function makeGameMessage(source, destination, msgname, gmdata) {
    return {
      'message': 'GameMessage',
      'version': 1,
      'tag': '',
      'source': source,
      'destination': destination,
      'data': {
        'messageName': msgname,
        'data': gmdata
      }
    };
  }

  function sendMessage(msg) {
    var data = JSON.stringify(msg);
    websocket_wrapper.send(data);
  }

  function receiveMessage(msg) {
    var data = JSON.stringify(msg);
    websocket_wrapper.prototype.onmessage({data: data});
  }

  function sendChat(text) {
    // Send to others.
    var msg = makeGameMessage(userID, gameID, 'sendChat', {
      'text': text
    });
    sendMessage(msg);

    // Send to me.
    var myName = playerNames[playerIndex];
    var msg = makeGameMessage(gameID, userID, 'addChat', {
      'playerName': myName,
      'text': text
    });
    receiveMessage(msg);
  }

  function resign() {
    var msg = makeGameMessage(userID, gameID, 'resign', {});
    sendMessage(msg);
  }

  // For use from the console.
  window.PCESendChat = sendChat;
  window.PCEResign = resign;
}

// Boilerplate to run in page context (important for hooking the websocket).
var runInPageContext = function(fn) {
  var script = document.createElement('script');
  script.type = 'text/javascript';
  script.textContent = '('+ fn +')();';
  document.body.appendChild(script);
}

runInPageContext(main);

});
