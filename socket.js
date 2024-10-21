const { 
  getCleanTable, 
  shuffle, 
  whoGoesFirst, 
  faceOnTable,
  attackWithCard,
  checkWhichPlayerIsOut,
  endGameIfOver,
  defendCard,
  refillHands,
  shiftAttackerDefender,
} = require('./CardFunctions.js');

module.exports = (io) => {
    let sockets = [];

    let players = {};

    const fullDeck = [
      { face: 9, suit: 'S' },
      { face: 10, suit: 'S' },
      { face: 11, suit: 'S' },
      { face: 12, suit: 'S' },
      { face: 13, suit: 'S' },
      { face: 14, suit: 'S' },
      { face: 9, suit: 'C' },
      { face: 10, suit: 'C' },
      { face: 11, suit: 'C' },
      { face: 12, suit: 'C' },
      { face: 13, suit: 'C' },
      { face: 14, suit: 'C' },
      { face: 9, suit: 'D' },
      { face: 10, suit: 'D' },
      { face: 11, suit: 'D' },
      { face: 12, suit: 'D' },
      { face: 13, suit: 'D' },
      { face: 14, suit: 'D' },
      { face: 9, suit: 'H' },
      { face: 10, suit: 'H' },
      { face: 11, suit: 'H' },
      { face: 12, suit: 'H' },
      { face: 13, suit: 'H' },
      { face: 14, suit: 'H' },
    ];

    let table = {
      gameDeck: [],
      cardsToBeBeat: [],
      cardsOnTable: [],
      attackingCards: [],
      defendingCards: [],
      trumpCard: { face: 0, suit: '' },
      gameOver: [null, ''],
    };
    
    let privateTable = {
      passCounter: 0,
      attackerInitialPass: false,
    };

    io.on('connect', (socket) => {
      socket.on("join-room", ({ room, name, googleId, avatar }) => {
        try {
          if(!sockets[room]?.start){
            socket.join(room);
            socket.nickname = name;
            socket.room = room;

            if (!sockets[room]) {
              sockets[room] = {
                room,
                names: [],
                start: false,
                players: []
              };
            }
            
            sockets[room].names = [...sockets[room].names, {
              name, 
              googleId,
              avatar,
            }];
  
            sockets[room].players = [...sockets[room].players, {
              googleId,
              socket
            }]

            io.to(
              sockets[room].players.length === 1 ? socket.id : room
            ).emit("player-connect", sockets[room].names);
          } else {
            io.to(socket.id).emit("room-exist", true);
          }
        } catch (err) {
          console.log(err.message);
        }
      });

      socket.on("start-game", (room) => {
        if(sockets[room] && sockets[room].players.length === 2){
          io.in(room).emit("start-game");
          sockets[socket.room].start = true;

          // erase the whole table
          table = getCleanTable();

          table.gameDeck = fullDeck.map((x) => x);
          // shuffle the deck
          shuffle(table.gameDeck);

          for(let player in sockets[room].players){
            players[sockets[room].players[player].googleId] = sockets[room].players[player].socket
          }

          // iterate through all players
          for (const [player, value] of Object.entries(players)) {
            value.inGame = true;
            value.hand = [];
            value.role = null;
            value.opponents = [];
            value.selectedCard = null;
            value.pass = false;
      
            // deal out cards to each player
            for (var i = 0; value.hand.length < 6; i++) {
              const dealtCard = table.gameDeck.shift();
              value.hand.push(dealtCard);
            }
          }

          // determine the trump suit
          table.trumpCard.face = table.gameDeck[table.gameDeck.length - 1].face;
          table.trumpCard.suit = table.gameDeck[table.gameDeck.length - 1].suit;

          whoGoesFirst(players, table);

          let cards = [];

          for (const [player, playerSocket] of Object.entries(players)) {
            cards.push({
              googleId: player,
              cards: playerSocket.hand,
              role: playerSocket.role
            })
          }

          io.in(room).emit('card-table', { cards: cards, table: table });
        }
      });

      socket.on("select-card-from-hand", (data) => {
        const defenderId = Object.keys(players).find((id) => {
          return players[id].role === 'defender';
        });

        if ((
          players[data.playerId].role === 'attacker' ||
          players[data.playerId].role === 'neutral') &&
          faceOnTable(data.card.face, table) === true &&
          players[defenderId].hand.length > table.cardsToBeBeat.length
        ) {
          attackWithCard(players, table, data);
          privateTable.passCounter = 0;
          checkWhichPlayerIsOut(players, table);
          endGameIfOver(players, table);
         
          let cards = [];

          for (const [player, playerSocket] of Object.entries(players)) {
            cards.push({
              googleId: player,
              cards: playerSocket.hand,
              role: playerSocket.role
            })
          }

          io.in(data.room).emit('card-table', { cards: cards, table: table });
        } else if (players[data.playerId].role === 'defender') {
          players[data.playerId].selectedCard = data.card;
        }
      })

      socket.on('defend-card-on-table' , (data) => {
        // check if player is defender, 
        // has a selected card, and if attack card on table needs to be beat
        if (
          players[data.playerId].role === 'defender' &&
          players[data.playerId].selectedCard !== null &&
          table.cardsToBeBeat.findIndex((item) => 
            item.face === data.card.face && item.suit === data.card.suit
          ) !== -1
        ) {
          // check if selected card is higher 
          // face value than attack card || selected card is trump 
          // and attack card is not
          if (
            (players[data.playerId].selectedCard.face > data.card.face &&
              players[data.playerId].selectedCard.suit === data.card.suit) ||
            (players[data.playerId].selectedCard.suit === table.trumpCard.suit &&
              data.card.suit !== table.trumpCard.suit)
          ) {
            defendCard(players, table, data);
            checkWhichPlayerIsOut(players, table);
            endGameIfOver(players, table);
    
            // if defender hand empty, 
            // end round as if it was passed
            if (
              players[data.playerId].hand.length === 0 &&
              table.gameOver[0] !== true
            ) {
              data.method = 'pass';
              table.cardsToBeBeat = [];
              table.cardsOnTable = [];
              table.attackingCards = [];
              table.defendingCards = [];
    
              refillHands(players, table);
              shiftAttackerDefender(players, data);
            }

            let cards = [];

            for (const [player, playerSocket] of Object.entries(players)) {
              cards.push({
                googleId: player,
                cards: playerSocket.hand,
                role: playerSocket.role
              })
            }

            io.in(data.room).emit('card-table', { cards: cards, table: table });
          }
        }
        //----------------------------------------------------------------------------------------------PICK UP
      })

      socket.on('card-pick-up', (data) => {
        players[data.playerId].hand = players[data.playerId].hand.concat(
          table.cardsOnTable
        );
    
        table.cardsToBeBeat = [];
        table.cardsOnTable = [];
        table.attackingCards = [];
        table.defendingCards = [];
    
        for (const [player, value] of Object.entries(players)) {
          value.pass = false
        }
    
        refillHands(players, table);
        shiftAttackerDefender(players, data);
    
        let cards = [];

        for (const [player, playerSocket] of Object.entries(players)) {
          cards.push({
            googleId: player,
            cards: playerSocket.hand,
            role: playerSocket.role
          })
        }

        io.in(data.room).emit('card-table', { cards: cards, table: table });
      })

      socket.on('card-pass', (data) => {
        if (
          (players[data.playerId].role === 'attacker' ||
            players[data.playerId].role === 'neutral') &&
          (players[data.playerId].hand.length > 0 || table.gameDeck.length > 0)
        ) {
          privateTable.passCounter += 1;
          players[data.playerId].pass = true
        }
    
        if (players[data.playerId].role === 'attacker') {
          privateTable.attackerInitialPass = true;
        }
    
        if (privateTable.attackerInitialPass === true) {
          Object.values(players).forEach((cur) => {
            if (cur.role === null && cur.inGame === true) {
              cur.role = 'neutral';
            }
          });
        }
    
        const activePlayers = Object.values(players).filter(
          (player) => player.inGame === true
        );
    
        if (privateTable.passCounter === activePlayers.length - 1) {
          table.cardsToBeBeat = [];
          table.cardsOnTable = [];
          table.attackingCards = [];
          table.defendingCards = [];
    
          for (const [player, value] of Object.entries(players)) {
            value.pass = false
          }
    
          if(activePlayers.length > 1){
            refillHands(players, table);
            shiftAttackerDefender(players, data);
          }
        }

        let cards = [];

        for (const [player, playerSocket] of Object.entries(players)) {
          cards.push({
            googleId: player,
            cards: playerSocket.hand,
            role: playerSocket.role
          })
        }

        io.in(data.room).emit('card-table', { cards: cards, table: table });
      })

      socket.on("leave-room", () => {
        try {
          const room = sockets[socket.room];

          if(room){
            table = getCleanTable();  
            delete sockets[socket.room];
            io.in(room.room).emit("player-connect", []);
            io.in(room.room).emit("exit-game", socket.nickname)
          }

        } catch (error) {
          console.log(error.message);
        }
      });

      socket.on("disconnect", () => { 
        try {
          const room = sockets[socket.room];
          
          if(room){
            table = getCleanTable();  
            delete sockets[socket.room];
            io.in(room.room).emit("player-connect", []);
            io.in(room.room).emit("exit-game", socket.nickname)
          }

        } catch (error) {
          console.log(error.message);
        }
      });

      socket.on("game-over", room => {
        try {
          delete sockets[socket.room];
          table = getCleanTable();  
          io.in(room).emit("player-connect", []);
          io.in(room).emit("looser", socket.nickname);
        } catch (error) {
          console.log(error.message);
        }
      })
    })
}