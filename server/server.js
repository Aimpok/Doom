server.jsconst express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Настройка CORS для Socket.io
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Раздаем статические файлы если нужно
app.use(express.static(path.join(__dirname, '../public')));

// Хранилище комнат
const rooms = new Map();

// Генерация случайной позиции в лабиринте
function getRandomPosition() {
  return {
    x: Math.random() * 100 - 50,
    z: Math.random() * 100 - 50
  };
}

io.on('connection', (socket) => {
  console.log('✅ Новый игрок подключился:', socket.id);

  // Присоединение к комнате
  socket.on('joinRoom', (data) => {
    const { roomCode, playerId, playerName } = data;
    
    console.log(`🎮 Игрок ${playerName} пытается присоединиться к комнате ${roomCode}`);
    
    // Создаем комнату если не существует
    if (!rooms.has(roomCode)) {
      rooms.set(roomCode, {
        players: new Map(),
        enemies: [],
        createdAt: Date.now()
      });
      console.log(`🆕 Создана новая комната: ${roomCode}`);
    }
    
    const room = rooms.get(roomCode);
    const startPos = getRandomPosition();
    
    // Добавляем игрока в комнату
    room.players.set(playerId, {
      id: playerId,
      name: playerName,
      x: startPos.x,
      z: startPos.z,
      hp: 100,
      socketId: socket.id,
      lastUpdate: Date.now()
    });
    
    // Присоединяем сокет к комнате
    socket.join(roomCode);
    
    // Сообщаем всем о новом игроке
    socket.to(roomCode).emit('playerJoined', {
      playerId,
      playerName,
      x: startPos.x,
      z: startPos.z,
      hp: 100
    });
    
    // Отправляем текущее состояние комнаты новому игроку
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
    
    console.log(`✅ Игрок ${playerName} присоединился к комнате ${roomCode}. Игроков в комнате: ${room.players.size}`);
  });

  // Движение игрока
  socket.on('playerMove', (data) => {
    const { roomCode, playerId, x, z, yaw, pitch } = data;
    
    if (rooms.has(roomCode)) {
      const room = rooms.get(roomCode);
      if (room.players.has(playerId)) {
        // Обновляем позицию игрока
        const player = room.players.get(playerId);
        player.x = x;
        player.z = z;
        player.yaw = yaw;
        player.pitch = pitch;
        player.lastUpdate = Date.now();
        
        // Отправляем обновление другим игрокам
        socket.to(roomCode).emit('playerMoved', {
          playerId,
          x,
          z,
          yaw,
          pitch
        });
      }
    }
  });

  // Выстрел игрока
  socket.on('playerShoot', (data) => {
    const { roomCode, playerId } = data;
    socket.to(roomCode).emit('playerShoot', { playerId });
    console.log(`🔫 Игрок ${playerId} выстрелил в комнате ${roomCode}`);
  });

  // Получение урона игроком
  socket.on('playerDamage', (data) => {
    const { roomCode, playerId, damage, hp } = data;
    
    if (rooms.has(roomCode)) {
      const room = rooms.get(roomCode);
      if (room.players.has(playerId)) {
        room.players.get(playerId).hp = hp;
        socket.to(roomCode).emit('playerDamage', { playerId, hp });
        console.log(`💥 Игрок ${playerId} получил урон. HP: ${hp}`);
      }
    }
  });

  // Смерть игрока
  socket.on('playerDeath', (data) => {
    const { roomCode, playerId } = data;
    socket.to(roomCode).emit('playerDeath', { playerId });
    console.log(`💀 Игрок ${playerId} погиб в комнате ${roomCode}`);
  });

  // Убийство врага
  socket.on('enemyKilled', (data) => {
    const { roomCode, enemyId } = data;
    socket.to(roomCode).emit('enemyKilled', { enemyId });
    console.log(`👾 Враг убит в комнате ${roomCode}`);
  });

  // Отключение игрока
  socket.on('disconnect', () => {
    console.log('❌ Игрок отключился:', socket.id);
    
    // Находим и удаляем игрока из всех комнат
    for (const [roomCode, room] of rooms.entries()) {
      for (const [playerId, player] of room.players.entries()) {
        if (player.socketId === socket.id) {
          room.players.delete(playerId);
          socket.to(roomCode).emit('playerLeft', { playerId });
          console.log(`🚪 Игрок ${player.name} покинул комнату ${roomCode}`);
          
          // Удаляем комнату если пустая
          if (room.players.size === 0) {
            rooms.delete(roomCode);
            console.log(`🗑️ Комната ${roomCode} удалена (пустая)`);
          }
          break;
        }
      }
    }
  });

  // Пинг для проверки соединения
  socket.on('ping', (data) => {
    socket.emit('pong', { ...data, serverTime: Date.now() });
  });
});

// Очистка неактивных комнат каждые 5 минут
setInterval(() => {
  const now = Date.now();
  const inactiveTime = 30 * 60 * 1000; // 30 минут
  
  for (const [roomCode, room] of rooms.entries()) {
    let allInactive = true;
    
    for (const player of room.players.values()) {
      if (now - player.lastUpdate < inactiveTime) {
        allInactive = false;
        break;
      }
    }
    
    if (allInactive && (now - room.createdAt > inactiveTime)) {
      rooms.delete(roomCode);
      console.log(`🧹 Удалена неактивная комната: ${roomCode}`);
    }
  }
}, 5 * 60 * 1000);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    rooms: rooms.size,
    totalPlayers: Array.from(rooms.values()).reduce((sum, room) => sum + room.players.size, 0)
  });
});

// Главная страница
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
            .room { background: #333; padding: 15px; margin: 10px 0; border-radius: 5px; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🎮 Doom Maze Multiplayer Server</h1>
            <div class="status">
                <h2>Статус сервера: <span style="color: #4CAF50;">🟢 Работает</span></h2>
                <p>Активных комнат: <strong>${rooms.size}</strong></p>
                <p>Всего игроков: <strong>${Array.from(rooms.values()).reduce((sum, room) => sum + room.players.size, 0)}</strong></p>
            </div>
            <h2>Активные комнаты:</h2>
            ${Array.from(rooms.entries()).map(([code, room]) => `
                <div class="room">
                    <h3>Комната: ${code}</h3>
                    <p>Игроков: ${room.players.size}</p>
                    <p>Создана: ${new Date(room.createdAt).toLocaleTimeString()}</p>
                </div>
            `).join('') || '<p>Нет активных комнат</p>'}
        </div>
    </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});
