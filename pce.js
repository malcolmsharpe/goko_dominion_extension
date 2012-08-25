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
          data = handleMessageHelper(data, DIRECTION.RECEIVING, function(new_data) {
            websocket_wrapper.trueonmessage({data: new_data});
          });
        };
        this.__defineSetter__('onmessage', function(val) {
          websocket_wrapper.trueonmessage = val;
        });
        this.send = function(data) {
          var that = this;
          data = handleMessageHelper(data, DIRECTION.SENDING, function(new_data) {
            that.prototype.send(new_data);
          });
        };
      };
    }(window.WebSocket);
  }

  hookWebSocket();

  function handleMessageHelper(data, direction, callback) {
    var ret = handleMessage(data, direction);
    if (ret == false) {
      console.log('Cancelled websocket traffic.');
      return;
    } else if (ret != undefined) {
      console.log('Modified websocket traffic.');
      console.log('Original: ' + data);
      data = ret;
      console.log('Modified: ' + data);
    }
    callback(data);
  }

  //// Utilities.
  // Format JSON nicely (to print to the console).
  function prettyJSON(msg) {
    return JSON.stringify(msg, null, 4);
  }

  function reportError(msg) {
    var errorMsg = 'ERROR: ' + msg;
    console.log(errorMsg);
    alert(errorMsg);
  }

  //// Main code.
  var userID;
  var gameID;

  var playerNames;
  var playerIndex;

  var PRINT_MESSAGE_TYPES = false;
  var DUMP_MESSAGES = {
  };
  var PRINT_GM_TYPES = false;
  var DUMP_ALL_GM = true;
  var DUMP_GM = {
  };
  var CANCEL_GM = {
    'doParticleEffectAnimations': true
  };

  var CHEAT_BUYABLE = false;
  var CHEAT_SUPPLY_PLAYABLE = false;

  function handleMessage(raw_data, direction) {
    var msg = $.parseJSON(raw_data);

    var formatted_message_type = msg.message + ' (' + direction + ')';

    if (PRINT_MESSAGE_TYPES
        && (!PRINT_GM_TYPES || msg.message != 'GameMessage')) {
      console.log('Message type: ' + formatted_message_type);
    }

    if (DUMP_MESSAGES[msg.message]) {
      console.log(formatted_message_type + ': ' + prettyJSON(msg));
    }

    var changed = false;
    var cancel = false;

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

        initGame(gmdata);

        // Send a greeting.
        var wait_time = 4000;
        setTimeout(introducePlugin, wait_time);
      } else if (msgname == 'putCards') {
        var target = gmdata.target;
        $.each(gmdata.cards, function(i, qcard) {
          // Backs of cards are for the initial deck, which we already
          // handled.
          if (qcard != "back") {
            putCard(qcard, target);
          }
        });
      } else if (msgname == 'moveCards') {
        // Process a card move that is NOT triggered by this player's input.
        $.each(gmdata, function(i, moveData) {
          // moveCard and destinationCard sometimes have the value "back",
          // but (so far) sourceCard always shows what the card is.
          var qcard = moveData.sourceCard;
          if (qcard == 'back') {
            reportError('Unknown moved card for move data: ' + prettyJSON(moveData));
            return;
          }

          moveCard(qcard, moveData.source.area, moveData.destination.area);
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
              reportError('Unknown moved card for response data: ' + prettyJSON(gmdata));
            }
            return;
          }
          moveCard(card, gmdata.source.area, gmdata.destination.area);
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
        } else if (gmdata.id == undefined && gmdata.area.name == 'supply') {
          // This looks like a reply to an Embargo play.
        } else if (gmdata.id == 'gold' || gmdata.id == 'cards' || gmdata.id == 'trash') {
          // This looks like a response to Governor.
        } else {
          reportError('Unrecognized uiMultiSelectResponse: ' + prettyJSON(gmdata));
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

      updateDisplay();

      if (CANCEL_GM[msgname]) cancel = true;
    }

    if (cancel) return false;
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

  //// Game state.
  function initGame(gmdata) {
    initAreas();

    // Generate the card IDs for the starting decks, since they aren't
    // reported to us directly.
    // TODO: Does this actually work reliably?
    var nextIndex = {
      'copper': 0,
      'estate': 0
    }
    $.each(gmdata.startingDecks, function(playerIndex, cards) {
      var player = playerNames[playerIndex];
      $.each(cards, function(j, card) {
        var qualifiedCard = card + '.' + nextIndex[card];
        ++nextIndex[card];
        putCard(qualifiedCard, makeDeckArea(playerIndex));
      });
    });
  }

  // Areas.
  var areaCards;

  function initAreas() {
    areaCards = {};
  }

  function areaToString(area) {
    var player;
    if (area.playerIndex != undefined) player = playerNames[area.playerIndex];

    if (area.name == 'trash') return 'trash';
    else if (area.name == 'play') return 'play';
    else if (area.name == 'supply') return 'supply (' + area.supplyDeck + ')';
    else if (area.name == 'discard') return 'discard (' + player + ')';
    else if (area.name == 'hand') return 'hand (' + player + ')';
    else if (area.name == 'deck') return 'deck (' + player + ')';
    else if (area.name == 'globalReveal') return 'globalReveal';
    else if (area.name == 'globalRevealTwo') return 'globalRevealTwo';
    else if (area.name == 'reveal') return 'reveal (' + player + ')';
    else if (area.name == 'nativeVillageMat') return 'nativeVillageMat (' + player + ')';
    else if (area.name == 'islandMat') return 'islandMat (' + player + ')';
    else if (area.name == 'durationMat') return 'durationMat (' + player + ')';
    else {
      reportError('Unknown area: ' + prettyJSON(area));
      return;
    }
  }

  function makeDeckArea(playerIndex) {
    return {
      'name': 'deck',
      'playerIndex': playerIndex
    }
  }

  function getAreaCards(area) {
    // Store the cards in an area as an array, because sometimes order
    // matters, such as for supply piles.
    areaStr = areaToString(area);
    if (areaCards[areaStr] == undefined) areaCards[areaStr] = [];
    return areaCards[areaStr];
  }

  function putCard(qcard, area) {
    getAreaCards(area).push(qcard);
  }

  function removeCard(qcard, area) {
    var cards = getAreaCards(area);
    var idx = cards.indexOf(qcard);
    if (idx == -1) {
      reportError('Card ' + qcard + ' not in area ' + areaToString(area));
      return;
    }
    cards.splice(idx, 1);
  }

  function moveCard(qcard, src, dst) {
    removeCard(qcard, src);
    putCard(qcard, dst);
  }


  //// Display.
  function updateDisplay() {
    var html = '';
    html += 'Game state:<br>';
    for (var areaStr in areaCards) {
      var cards = areaCards[areaStr];
      html += areaStr + ':  ' + JSON.stringify(cards) + '<br>';
    }
    $('#display-div').html(html);
  }

  function getCanvas() {
    return $('#myCanvas');
  }

  function toggleFauxIsotropic() {
  }


  //// Set up display area.
  $('body').append('<div id="display-div"></div>');

  $('#display-div').css('color', 'white');
  $('#display-div').css('font-family', 'monospace');


  //// For use from the console.
  window.PCESendChat = sendChat;
  window.PCEResign = resign;
  window.PCEGetCanvas = getCanvas;
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
