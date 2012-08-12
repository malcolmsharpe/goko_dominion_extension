# What is it?

A deck tracker extension for Goko Dominion.

# What does it do now?

Not much. It mainly reports, to the console, movement of cards between different
areas of the Goko Dominion client. Together with the other information it
tracks, there is enough info there to know every player's deck contents and
score, but right now the extension doesn't do that.

# How does it work?

The extension hooks WebSocket and then intercepts the communication between the
Goko Dominion client and the server. It does NOT look at the log, but instead at
the movement of cards between different areas of the client (supply, deck,
discard, etc.). This way, all necessary information is available without
parsing.

# Known issues

- Nothing is actually tracked yet.
- Some information is observable that shouldn't be:
  * The exact cards any player draws.
  * The cards passed to Masquerade, even before every player has selected a
    card.
  * Unconfirmed: the card drawn onto the Native Village mat.
