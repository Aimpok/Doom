const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

const rooms = new Map();

function getRandomPosition() {
  return {
    x: Math.random() * 100 - 50,
    z: Math.random() * 100 - 50
  };
}

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  socket.on('joinRoom', (data) => {
    const { roomCode, playerId, playerName } = data;
    
    if (!rooms.has(roomCode)) {
      rooms.set(roomCode, {
        players: new Map(),
        createdAt: Date.now()
      });
    }
    
    const room = rooms.get(roomCode);
    const startPos = getRandomPosition();
    
    room.players.set(playerId, {
      id: playerId,
      name: playerName,
      x: startPos.x,
      z: startPos.z,
      hp: 100,
      socketId: socket.id,
      lastUpdate: Date.now()
    });
    
    socket.join(roomCode);
    
    socket.to(roomCode).emit('playerJoined', {
      playerId,
      playerName,
      x: startPos.x,
      z: startPos.z,
      hp: 100
    });
    
    const playersInRoom = Array.from(room.players.values())
      .filter(p => p.id !== playerId)
      .map(p => ({
        playerId: p.id,
        playerName: p.name,
        x: p.x,
        z: p.z,
        hp: p.hp
      }));
    
    socket.emit('roomState', playersInRoom);
    
    console.log(`Player ${playerName} joined room ${roomCode}. Players: ${room.players.size}`);
  });

  socket.on('playerMove', (data) => {
    const { roomCode, playerId, x, z } = data;
    
    if (rooms.has(roomCode)) {
      const room = rooms.get(roomCode);
      if (room.players.has(playerId)) {
        const player = room.players.get(playerId);
        player.x = x;
        player.z = z;
        player.lastUpdate = Date.now();
        
        socket.to(roomCode).emit('playerMoved', {
          playerId,
          x,
          z
        });
      }
    }
  });

  socket.on('playerShoot', (data) => {
    const { roomCode, playerId } = data;
    socket.to(roomCode).emit('playerShoot', { playerId });
  });

  socket.on('playerDamage', (data) => {
    const { roomCode, playerId, damage, hp } = data;
    
    if (rooms.has(roomCode)) {
      const room = rooms.get(roomCode);
      if (room.players.has(playerId)) {
        room.players.get(playerId).hp = hp;
        socket.to(roomCode).emit('playerDamage', { playerId, hp });
      }
    }
  });

  socket.on('playerDeath', (data) => {
    const { roomCode, playerId } = data;
    socket.to(roomCode).emit('playerDeath', { playerId });
  });

  socket.on('enemyKilled', (data) => {
    const { roomCode, enemyId } = data;
    socket.to(roomCode).emit('enemyKilled', { enemyId });
  });

  socket.on('disconnect', () => {
    console.log('Disconnected:', socket.id);
    
    for (const [roomCode, room] of rooms.entries()) {
      for (const [playerId, player] of room.players.entries()) {
        if (player.socketId === socket.id) {
          room.players.delete(playerId);
          socket.to(roomCode).emit('playerLeft', { playerId });
          
          if (room.players.size === 0) {
            rooms.delete(roomCode);
          }
          break;
        }
      }
    }
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    rooms: rooms.size,
    totalPlayers: Array.from(rooms.values()).reduce((sum, room) => sum + room.players.size, 0)
  });
});

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Doom Maze Server</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; background: #1a1a1a; color: #fff; }
            .container { max-width: 800px; margin: 0 auto; }
            .status { background: #2a2a2a; padding: 20px; border-radius: 10px; margin: 20px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🎮 Doom Maze Multiplayer Server</h1>
            <div class="status">
                <h2>Server Status: <span style="color: #4CAF50;">🟢 Running</span></h2>
                <p>Active Rooms: <strong>${rooms.size}</strong></p>
                <p>Total Players: <strong>${Array.from(rooms.values()).reduce((sum, room) => sum + room.players.size, 0)}</strong></p>
            </div>
            <p>Server is ready for connections!</p>
        </div>
    </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
