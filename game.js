// Система сохранения настроек
class SettingsManager {
    constructor() {
        this.defaultSettings = {
            musicVolume: 50,
            soundVolume: 50,
            sensitivity: 5,
            coins: 0
        };
        this.loadSettings();
    }

    loadSettings() {
        try {
            const saved = localStorage.getItem('doomMazeSettings');
            if (saved) {
                const settings = JSON.parse(saved);
                this.musicVolume = settings.musicVolume || this.defaultSettings.musicVolume;
                this.soundVolume = settings.soundVolume || this.defaultSettings.soundVolume;
                this.sensitivity = settings.sensitivity || this.defaultSettings.sensitivity;
                this.coins = settings.coins || this.defaultSettings.coins;
            } else {
                this.musicVolume = this.defaultSettings.musicVolume;
                this.soundVolume = this.defaultSettings.soundVolume;
                this.sensitivity = this.defaultSettings.sensitivity;
                this.coins = this.defaultSettings.coins;
            }
        } catch (e) {
            console.error('Ошибка загрузки настроек:', e);
            this.musicVolume = this.defaultSettings.musicVolume;
            this.soundVolume = this.defaultSettings.soundVolume;
            this.sensitivity = this.defaultSettings.sensitivity;
            this.coins = this.defaultSettings.coins;
        }
    }

    saveSettings() {
        try {
            const settings = {
                musicVolume: this.musicVolume,
                soundVolume: this.soundVolume,
                sensitivity: this.sensitivity,
                coins: this.coins
            };
            localStorage.setItem('doomMazeSettings', JSON.stringify(settings));
        } catch (e) {
            console.error('Ошибка сохранения настроек:', e);
        }
    }

    updateSetting(key, value) {
        if (this.hasOwnProperty(key)) {
            this[key] = value;
            this.saveSettings();
            return true;
        }
        return false;
    }

    addCoins(amount) {
        this.coins += amount;
        this.saveSettings();
        updateCoinCounter();
        return this.coins;
    }

    getCoins() {
        return this.coins;
    }
}

// Создаем менеджер настроек
const settingsManager = new SettingsManager();

// Переменные для режимов игры
let currentGameMode = null;
let enemiesKilled = 0;
let targetEnemies = 20;
let currentWave = 1;
let exitArea = null;
let waveSpawnTimer = 0;
let waveEnemiesCount = 0;
let waveEnemiesKilled = 0;
let enemiesToSpawn = 0;
let lastSpawnTime = 0;
const SPAWN_INTERVAL = 1000;

// Базовые настройки
const scene = new THREE.Scene();

// ТУМАН и цвет неба
scene.fog = new THREE.Fog(0x87CEEB, 20, 50);
scene.background = new THREE.Color(0x87CEEB);

// Камера с МЕНЬШЕЙ дальностью прорисовки
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 50);

const renderer = new THREE.WebGLRenderer({ 
    antialias: true,
    powerPreference: "high-performance"
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x87CEEB);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

// Параметры лабиринта
const CELL_SIZE = 8;
const WALL_HEIGHT = 8;
const WALL_THICKNESS = 0.3;

// Текстуры
const textureLoader = new THREE.TextureLoader();
let wallTexture, floorTexture, roofTexture;

// Загрузка текстур
function loadTextures() {
    return new Promise((resolve) => {
        let texturesLoaded = 0;
        const totalTextures = 3;

        function onTextureLoad() {
            texturesLoaded++;
            if (texturesLoaded === totalTextures) {
                resolve();
            }
        }

        wallTexture = textureLoader.load('Textures/WallTex.jpg', onTextureLoad, undefined, (error) => {
            console.error('Ошибка загрузки текстуры стен:', error);
            wallTexture = null;
            onTextureLoad();
        });

        floorTexture = textureLoader.load('Textures/FloorTex.jpg', onTextureLoad, undefined, (error) => {
            console.error('Ошибка загрузки текстуры пола:', error);
            floorTexture = null;
            onTextureLoad();
        });

        roofTexture = textureLoader.load('Textures/RoofTex.jpg', onTextureLoad, undefined, (error) => {
            console.error('Ошибка загрузки текстуры потолка:', error);
            roofTexture = null;
            onTextureLoad();
        });

        // НАСТРОЙКИ ТЕКСТУР
        if (wallTexture) {
            wallTexture.wrapS = wallTexture.wrapT = THREE.RepeatWrapping;
            wallTexture.repeat.set(1, 1);
            wallTexture.minFilter = THREE.LinearFilter;
            wallTexture.magFilter = THREE.LinearFilter;
        }
        if (floorTexture) {
            floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
            floorTexture.repeat.set(20, 20);
            floorTexture.minFilter = THREE.LinearFilter;
            floorTexture.magFilter = THREE.LinearFilter;
        }
        if (roofTexture) {
            roofTexture.wrapS = roofTexture.wrapT = THREE.RepeatWrapping;
            roofTexture.repeat.set(20, 20);
            roofTexture.minFilter = THREE.LinearFilter;
            roofTexture.magFilter = THREE.LinearFilter;
        }
    });
}

// Создаем материалы с текстурами
function createMaterials() {
    const wallMaterial = wallTexture ? 
        new THREE.MeshLambertMaterial({ 
            map: wallTexture,
            fog: true
        }) :
        new THREE.MeshLambertMaterial({ 
            color: 0x8B4513,
            fog: true
        });
    
    const floorMaterial = floorTexture ? 
        new THREE.MeshLambertMaterial({ 
            map: floorTexture,
            fog: true
        }) :
        new THREE.MeshLambertMaterial({ 
            color: 0x90EE90,
            fog: true
        });
    
    const roofMaterial = roofTexture ? 
        new THREE.MeshLambertMaterial({ 
            map: roofTexture,
            fog: true
        }) :
        new THREE.MeshLambertMaterial({ 
            color: 0xCCCCCC,
            fog: true
        });
    
    return { wallMaterial, floorMaterial, roofMaterial };
}

// Генератор лабиринта для разных режимов
class MazeGenerator {
    constructor(width, height, mode = 'extermination') {
        this.width = width;
        this.height = height;
        this.mode = mode;
        this.maze = this.generateMazeForMode();
        this.exitPosition = this.findExitPosition();
    }

    generateMazeForMode() {
        if (this.mode === 'straight') {
            return this.generateRealMaze();
        } else {
            return this.generateMazeWithMultiplePaths();
        }
    }

    // РЕАЛЬНЫЙ лабиринт для режима Straight Through
    generateRealMaze() {
        let maze = Array(this.height).fill().map(() => Array(this.width).fill(1));
        
        // Используем алгоритм поиска в глубину для создания настоящего лабиринта
        this.depthFirstMaze(maze, 1, 1);
        
        // Гарантируем, что начальная позиция (1,1) и конечная (width-2, height-2) проходимы
        maze[1][1] = 0;
        maze[this.height-2][this.width-2] = 0;
        
        // Добавляем дополнительные проходы для сложности
        this.addExtraPassages(maze, 0.1);
        
        return maze;
    }

    depthFirstMaze(maze, startX, startY) {
        let stack = [[startX, startY]];
        maze[startY][startX] = 0;
        
        const directions = [[0, 2], [2, 0], [0, -2], [-2, 0]];
        
        while (stack.length > 0) {
            let [x, y] = stack[stack.length - 1];
            
            let neighbors = [];
            for (let [dx, dy] of directions) {
                let nx = x + dx, ny = y + dy;
                if (nx > 0 && nx < this.width - 1 && ny > 0 && ny < this.height - 1 && maze[ny][nx] === 1) {
                    let valid = true;
                    for (let [ddx, ddy] of [[0,1],[1,0],[0,-1],[-1,0]]) {
                        let nnx = nx + ddx, nny = ny + ddy;
                        if (nnx !== x && nny !== y && maze[nny] && maze[nny][nnx] === 0) {
                            valid = false;
                            break;
                        }
                    }
                    if (valid) {
                        neighbors.push([dx, dy, nx, ny]);
                    }
                }
            }
            
            if (neighbors.length > 0) {
                let [dx, dy, nx, ny] = neighbors[Math.floor(Math.random() * neighbors.length)];
                maze[y + dy/2][x + dx/2] = 0;
                maze[ny][nx] = 0;
                stack.push([nx, ny]);
            } else {
                stack.pop();
            }
        }
    }

    addExtraPassages(maze, probability) {
        for (let y = 1; y < this.height - 1; y++) {
            for (let x = 1; x < this.width - 1; x++) {
                if (maze[y][x] === 1 && Math.random() < probability) {
                    let wallCount = 0;
                    for (let [dx, dy] of [[0,1],[1,0],[0,-1],[-1,0]]) {
                        if (maze[y+dy] && maze[y+dy][x+dx] === 1) {
                            wallCount++;
                        }
                    }
                    if (wallCount >= 3) {
                        maze[y][x] = 0;
                    }
                }
            }
        }
    }

    generateMazeWithMultiplePaths() {
        let maze = Array(this.height).fill().map(() => Array(this.width).fill(1));
        const paths = [];
        const numPaths = 3;
        
        for (let i = 0; i < numPaths; i++) {
            let startX = 1 + Math.floor(Math.random() * (this.width - 3));
            let startY = 1 + Math.floor(Math.random() * (this.height - 3));
            paths.push(this.generatePath(maze, startX, startY));
        }
        
        this.connectPaths(maze, paths);
        this.addRandomPassages(maze);
        
        return maze;
    }

    generatePath(maze, startX, startY) {
        let x = startX, y = startY;
        maze[y][x] = 0;
        
        let path = [[x, y]];
        let directions = [[0, 2], [2, 0], [0, -2], [-2, 0]];
        let stack = [[x, y]];
        
        while (stack.length > 0) {
            let [cx, cy] = stack[stack.length - 1];
            
            let possibleDirs = directions.filter(([dx, dy]) => {
                let nx = cx + dx, ny = cy + dy;
                return nx > 0 && nx < this.width - 1 && 
                       ny > 0 && ny < this.height - 1 && 
                       maze[ny][nx] === 1;
            });
            
            if (possibleDirs.length > 0) {
                let [dx, dy] = possibleDirs[Math.floor(Math.random() * possibleDirs.length)];
                let nx = cx + dx, ny = cy + dy;
                
                maze[cy + dy/2][cx + dx/2] = 0;
                maze[ny][nx] = 0;
                
                path.push([nx, ny]);
                stack.push([nx, ny]);
            } else {
                stack.pop();
            }
        }
        
        return path;
    }

    connectPaths(maze, paths) {
        for (let i = 0; i < paths.length - 1; i++) {
            const connectionPoints = 2;
            for (let j = 0; j < connectionPoints; j++) {
                const point1 = paths[i][Math.floor(Math.random() * paths[i].length)];
                const point2 = paths[i+1][Math.floor(Math.random() * paths[i+1].length)];
                this.createPassage(maze, point1, point2);
            }
        }
    }

    createPassage(maze, [x1, y1], [x2, y2]) {
        let x = x1, y = y1;
        while (x !== x2 || y !== y2) {
            if (Math.random() > 0.5 && x !== x2) {
                x += x < x2 ? 1 : -1;
            } else if (y !== y2) {
                y += y < y2 ? 1 : -1;
            }
            if (x > 0 && x < this.width - 1 && y > 0 && y < this.height - 1) {
                maze[y][x] = 0;
            }
        }
    }

    addRandomPassages(maze) {
        const numExtraPassages = Math.floor(this.width * this.height * 0.1);
        for (let i = 0; i < numExtraPassages; i++) {
            const x = 1 + Math.floor(Math.random() * (this.width - 2));
            const y = 1 + Math.floor(Math.random() * (this.height - 2));
            if (maze[y][x] === 1) {
                const neighbors = [
                    [x-1, y], [x+1, y], [x, y-1], [x, y+1]
                ].filter(([nx, ny]) => 
                    nx >= 0 && nx < this.width && ny >= 0 && ny < this.height
                );
                const passageNeighbors = neighbors.filter(([nx, ny]) => maze[ny][nx] === 0);
                if (passageNeighbors.length >= 2) {
                    maze[y][x] = 0;
                }
            }
        }
    }

    findExitPosition() {
        if (this.mode === 'straight') {
            let maxDistance = -1;
            let exitPos = null;
            
            for (let y = 0; y < this.height; y++) {
                for (let x = 0; x < this.width; x++) {
                    if (this.maze[y][x] === 0) {
                        const distance = Math.sqrt((x-1)*(x-1) + (y-1)*(y-1));
                        if (distance > maxDistance) {
                            maxDistance = distance;
                            exitPos = { x, y };
                        }
                    }
                }
            }
            
            return exitPos;
        }
        return null;
    }

    getMaze() {
        return this.maze;
    }

    getExitPosition() {
        return this.exitPosition;
    }
}

// Создаем лабиринт
let mazeGen = null;
let maze = null;

// Освещение
const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
scene.add(ambientLight);

const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight1.position.set(50, 100, 50);
scene.add(directionalLight1);

const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.6);
directionalLight2.position.set(-50, 80, -50);
scene.add(directionalLight2);

// Создание сцены
function createScene(materials) {
    // Очищаем сцену от предыдущих объектов
    while(scene.children.length > 0){ 
        scene.remove(scene.children[0]); 
    }
    
    // Добавляем освещение обратно
    scene.add(ambientLight);
    scene.add(directionalLight1);
    scene.add(directionalLight2);
    
    createFloor(materials.floorMaterial);
    createRoof(materials.roofMaterial);
    createMazeWalls(materials.wallMaterial);
    
    // Создаем зону выхода для режима Straight Through
    if (currentGameMode === 'straight' && mazeGen.getExitPosition()) {
        createExitArea(mazeGen.getExitPosition());
        createExitArrow();
    }
}

function createFloor(floorMaterial) {
    const floorWidth = maze[0].length * CELL_SIZE;
    const floorHeight = maze.length * CELL_SIZE;
    const floorGeometry = new THREE.PlaneGeometry(floorWidth, floorHeight);
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1;
    scene.add(floor);
}

function createRoof(roofMaterial) {
    const roofWidth = maze[0].length * CELL_SIZE;
    const roofHeight = maze.length * CELL_SIZE;
    const roofGeometry = new THREE.PlaneGeometry(roofWidth, roofHeight);
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.rotation.x = Math.PI / 2;
    roof.position.y = WALL_HEIGHT - 1;
    scene.add(roof);
}

function createMazeWalls(wallMaterial) {
    const wallGroup = new THREE.Group();
    
    for (let y = 0; y < maze.length; y++) {
        for (let x = 0; x < maze[y].length - 1; x++) {
            if (maze[y][x] === 1 || maze[y][x+1] === 1) {
                if (maze[y][x] !== maze[y][x+1]) {
                    const wallGeometry = new THREE.BoxGeometry(WALL_THICKNESS, WALL_HEIGHT, CELL_SIZE);
                    const wall = new THREE.Mesh(wallGeometry, wallMaterial);
                    wall.position.set(
                        (x + 0.5 - maze[0].length/2) * CELL_SIZE, 
                        WALL_HEIGHT/2 - 1,
                        (y - maze.length/2) * CELL_SIZE
                    );
                    wallGroup.add(wall);
                }
            }
        }
    }

    for (let y = 0; y < maze.length - 1; y++) {
        for (let x = 0; x < maze[y].length; x++) {
            if (maze[y][x] === 1 || maze[y+1][x] === 1) {
                if (maze[y][x] !== maze[y+1][x]) {
                    const wallGeometry = new THREE.BoxGeometry(CELL_SIZE, WALL_HEIGHT, WALL_THICKNESS);
                    const wall = new THREE.Mesh(wallGeometry, wallMaterial);
                    wall.position.set(
                        (x - maze[0].length/2) * CELL_SIZE, 
                        WALL_HEIGHT/2 - 1,
                        (y + 0.5 - maze.length/2) * CELL_SIZE
                    );
                    wallGroup.add(wall);
                }
            }
        }
    }

    scene.add(wallGroup);
}

// Создание зоны выхода для режима Straight Through
function createExitArea(exitPos) {
    if (!exitPos) return;
    
    const exitGeometry = new THREE.BoxGeometry(CELL_SIZE * 0.8, 1, CELL_SIZE * 0.8);
    const exitMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x00ff00,
        transparent: true,
        opacity: 0.3
    });
    
    exitArea = new THREE.Mesh(exitGeometry, exitMaterial);
    exitArea.position.set(
        (exitPos.x - maze[0].length/2) * CELL_SIZE,
        0.5,
        (exitPos.y - maze.length/2) * CELL_SIZE
    );
    
    scene.add(exitArea);
    
    document.getElementById('exitArea').style.display = 'block';
}

// Создание стрелки для указания выхода
function createExitArrow() {
    document.getElementById('exitArrow').style.display = 'block';
}

// Обновление стрелки выхода
function updateExitArrow() {
    if (currentGameMode !== 'straight' || !exitArea) return;
    
    const arrow = document.getElementById('exitArrow');
    const playerDirection = new THREE.Vector3();
    camera.getWorldDirection(playerDirection);
    
    const toExit = new THREE.Vector3();
    toExit.subVectors(exitArea.position, camera.position);
    toExit.y = 0;
    toExit.normalize();
    
    const angle = Math.atan2(
        playerDirection.x * toExit.z - playerDirection.z * toExit.x,
        playerDirection.x * toExit.x + playerDirection.z * toExit.z
    );
    
    const degrees = angle * (180 / Math.PI);
    arrow.style.transform = `translateY(-50%) rotate(${degrees}deg)`;
}

// Позиция игрока
function findRandomStartPosition() {
    let freeCells = [];
    for (let y = 1; y < maze.length - 1; y++) {
        for (let x = 1; x < maze[y].length - 1; x++) {
            if (maze[y][x] === 0) {
                freeCells.push({x, y});
            }
        }
    }
    
    if (freeCells.length > 0) {
        const randomCell = freeCells[Math.floor(Math.random() * freeCells.length)];
        return {
            x: (randomCell.x - maze[0].length/2) * CELL_SIZE,
            z: (randomCell.y - maze.length/2) * CELL_SIZE
        };
    }
    
    return {
        x: (-maze[0].length/2 + 1) * CELL_SIZE,
        z: (-maze.length/2 + 1) * CELL_SIZE
    };
}

// Для режима Straight Through - спавн в углу
function findCornerStartPosition() {
    return {
        x: (-maze[0].length/2 + 1) * CELL_SIZE,
        z: (-maze.length/2 + 1) * CELL_SIZE
    };
}

let startPos = { x: 0, z: 0 };

// Переменные управления
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;

let yaw = 0;
let pitch = 0;
const PI_2 = Math.PI / 2;

// Настройки чувствительности из сохраненных данных
let mouseSensitivity = settingsManager.sensitivity * 0.0004;

// Аудио система
let musicVolume = settingsManager.musicVolume / 100;
let soundVolume = settingsManager.soundVolume / 100;
let currentMusic = null;
let musicTracks = [];
let currentTrackIndex = 0;
let musicStarted = false;

// Звуковые эффекты
let shootSound = null;
let reloadSound = null;
let playerHitSound = null;
let impDamageSound1 = null;
let impDamageSound2 = null;
let impDeathSound1 = null;
let impDeathSound2 = null;
let impDeathSound3 = null;
let coinSound = null;

// Оружие
const weapon = document.getElementById('weapon');
let isShooting = false;
let isReloading = false;
let canShoot = true;
let ammo = 2;
let maxAmmo = 2;
let hp = 100;

// Переменные для автоматической стрельбы
let isMouseDown = false;
let autoShootInterval = null;
let lastShootTime = 0;
const SHOOT_DELAY = 300;

// Предзагрузка изображений оружия
const gunImages = {
    normal: 'Guns/DefaultShootGun/Gun.png',
    shoot1: 'Guns/DefaultShootGun/GunSh1.png',
    shoot2: 'Guns/DefaultShootGun/GunSh2.png',
    reload1: 'Guns/DefaultShootGun/GunKD1.png',
    reload2: 'Guns/DefaultShootGun/GunKD2.png',
    reload3: 'Guns/DefaultShootGun/GunKD3.png'
};

// Функция предзагрузки изображений
function preloadWeaponImages() {
    Object.values(gunImages).forEach(src => {
        const img = new Image();
        img.src = src;
    });
}

// Инициализация аудио системы
function initAudio() {
    // Создаем звуковые эффекты
    shootSound = new Audio('Sounds/Shoot.mp3');
    reloadSound = new Audio('Sounds/Reload.mp3');
    playerHitSound = new Audio('Sounds/PlayerHit.mp3');
    coinSound = new Audio('Sounds/Coin.mp3');
    
    // Звуки врагов
    impDamageSound1 = new Audio('Sounds/Imp/ImpDamage.mp3');
    impDamageSound2 = new Audio('Sounds/Imp/ImpDamage1.mp3');
    impDeathSound1 = new Audio('Sounds/Imp/ImpDeath.mp3');
    impDeathSound2 = new Audio('Sounds/Imp/ImpDeath1.mp3');
    impDeathSound3 = new Audio('Sounds/Imp/ImpDeath2.mp3');
    
    // Настраиваем звуковые эффекты
    shootSound.volume = soundVolume;
    reloadSound.volume = soundVolume;
    playerHitSound.volume = soundVolume;
    coinSound.volume = soundVolume;
    impDamageSound1.volume = soundVolume;
    impDamageSound2.volume = soundVolume;
    impDeathSound1.volume = soundVolume;
    impDeathSound2.volume = soundVolume;
    impDeathSound3.volume = soundVolume;
    
    // Предзагружаем звуки
    shootSound.preload = 'auto';
    reloadSound.preload = 'auto';
    playerHitSound.preload = 'auto';
    coinSound.preload = 'auto';
    impDamageSound1.preload = 'auto';
    impDamageSound2.preload = 'auto';
    impDeathSound1.preload = 'auto';
    impDeathSound2.preload = 'auto';
    impDeathSound3.preload = 'auto';
    
    // Создаем список музыкальных треков
    musicTracks = [
        'Sounds/MenuMusic.mp3',
        'Sounds/MenuMusic1.mp3',
        'Sounds/MenuMusic2.mp3'
    ];
    
    console.log('Загружено музыкальных треков:', musicTracks.length);
    
    currentTrackIndex = Math.floor(Math.random() * musicTracks.length);
}

// Функция для воспроизведения следующего трека
function playNextTrack() {
    if (musicTracks.length === 0) {
        console.log('Нет музыкальных треков для воспроизведения');
        return;
    }
    
    if (currentMusic) {
        currentMusic.pause();
        currentMusic.currentTime = 0;
        currentMusic.removeEventListener('ended', playNextTrack);
    }
    
    currentTrackIndex = (currentTrackIndex + 1) % musicTracks.length;
    
    console.log('Воспроизведение трека:', musicTracks[currentTrackIndex]);
    
    currentMusic = new Audio(musicTracks[currentTrackIndex]);
    currentMusic.volume = musicVolume;
    currentMusic.loop = false;
    
    currentMusic.addEventListener('ended', playNextTrack);
    
    const playPromise = currentMusic.play();
    
    if (playPromise !== undefined) {
        playPromise.then(() => {
            console.log('Музыка успешно запущена');
            musicStarted = true;
        }).catch(error => {
            console.log('Автовоспроизведение музыки заблокировано:', error);
            document.addEventListener('click', startMusicOnInteraction, { once: true });
            document.addEventListener('touchstart', startMusicOnInteraction, { once: true });
        });
    }
}

// Функция запуска музыки
function startMusic() {
    if (musicStarted) return;
    
    console.log('Запуск музыки...');
    playNextTrack();
}

// Функция для принудительного запуска музыки при взаимодействии
function startMusicOnInteraction() {
    if (!musicStarted) {
        console.log('Принудительный запуск музыки после взаимодействия');
        startMusic();
    }
}

// Обновление громкости
function updateVolumes() {
    if (currentMusic) {
        currentMusic.volume = musicVolume;
    }
    if (shootSound) {
        shootSound.volume = soundVolume;
    }
    if (reloadSound) {
        reloadSound.volume = soundVolume;
    }
    if (playerHitSound) {
        playerHitSound.volume = soundVolume;
    }
    if (coinSound) {
        coinSound.volume = soundVolume;
    }
    if (impDamageSound1) {
        impDamageSound1.volume = soundVolume;
    }
    if (impDamageSound2) {
        impDamageSound2.volume = soundVolume;
    }
    if (impDeathSound1) {
        impDeathSound1.volume = soundVolume;
    }
    if (impDeathSound2) {
        impDeathSound2.volume = soundVolume;
    }
    if (impDeathSound3) {
        impDeathSound3.volume = soundVolume;
    }
}

// Обновление UI
function updateUI() {
    document.getElementById('hpDisplay').textContent = `HP: ${Math.round(hp)}`;
    document.getElementById('ammoDisplay').textContent = `ПАТРОНЫ: ${ammo}/${maxAmmo}`;
    
    if (currentGameMode === 'extermination') {
        document.getElementById('enemiesKilled').textContent = `Убито: ${enemiesKilled}/${targetEnemies}`;
        document.getElementById('waveCounter').style.display = 'none';
    } else if (currentGameMode === 'onslaught') {
        document.getElementById('enemiesKilled').textContent = `Убито: ${enemiesKilled}`;
        document.getElementById('waveCounter').textContent = `Волна: ${currentWave}`;
        document.getElementById('waveCounter').style.display = 'block';
    } else {
        document.getElementById('enemiesKilled').style.display = 'none';
        document.getElementById('waveCounter').style.display = 'none';
    }
}

// Обновление счетчика монет
function updateCoinCounter() {
    document.getElementById('coinsCount').textContent = settingsManager.getCoins();
}

// Анимация выстрела
function playShootAnimation() {
    if (!canShoot || isReloading || isShooting || ammo <= 0) {
        return;
    }
    
    isShooting = true;
    canShoot = false;
    ammo--;
    updateUI();
    
    weapon.src = gunImages.shoot1;
    
    if (shootSound) {
        shootSound.currentTime = 0;
        shootSound.play().catch(e => console.log('Не удалось воспроизвести звук выстрела'));
    }
    
    checkEnemyHit();
    
    setTimeout(() => {
        if (!isShooting) return;
        weapon.src = gunImages.shoot2;
    }, 50);
    
    setTimeout(() => {
        if (!isShooting) return;
        weapon.src = gunImages.normal;
        isShooting = false;
        
        if (ammo <= 0) {
            playReloadAnimation();
        } else {
            setTimeout(() => {
                canShoot = true;
            }, 300);
        }
    }, 150);
}

// Анимация перезарядки
function playReloadAnimation() {
    if (isReloading || ammo >= maxAmmo) {
        return;
    }
    
    isReloading = true;
    canShoot = false;
    
    if (reloadSound) {
        reloadSound.currentTime = 0;
        reloadSound.play().catch(e => console.log('Не удалось воспроизвести звук перезарядки'));
    }
    
    setTimeout(() => {
        if (!isReloading) return;
        weapon.src = gunImages.reload1;
    }, 100);
    
    setTimeout(() => {
        if (!isReloading) return;
        weapon.src = gunImages.reload2;
    }, 300);
    
    setTimeout(() => {
        if (!isReloading) return;
        weapon.src = gunImages.reload3;
    }, 500);
    
    setTimeout(() => {
        if (!isReloading) return;
        weapon.src = gunImages.normal;
        ammo = maxAmmo;
        isReloading = false;
        canShoot = true;
        updateUI();
    }, 700);
}

// Функция для автоматической стрельбы при удержании
function startAutoShoot() {
    if (autoShootInterval) return;
    
    autoShootInterval = setInterval(() => {
        const currentTime = Date.now();
        if (currentTime - lastShootTime >= SHOOT_DELAY) {
            playShootAnimation();
            lastShootTime = currentTime;
        }
    }, 100);
}

function stopAutoShoot() {
    if (autoShootInterval) {
        clearInterval(autoShootInterval);
        autoShootInterval = null;
    }
}

// FPS счетчик
const fpsCounter = document.getElementById('fpsCounter');
let frameCount = 0;
let lastTime = performance.now();
let fps = 0;

// УПРАВЛЕНИЕ
let activeTouches = new Map();
let isShootingTouch = false;
let shootTouchId = null;
let lastCameraTouchX = 0;
let lastCameraTouchY = 0;

// Инициализация джойстика
function initJoystick() {
    const joystickStick = document.getElementById('joystickStick');
    const joystickBase = document.getElementById('movementJoystick');
    
    let baseRect = joystickBase.getBoundingClientRect();
    const baseCenterX = baseRect.left + baseRect.width / 2;
    const baseCenterY = baseRect.top + baseRect.height / 2;
    const maxDistance = baseRect.width / 3;

    function updateJoystick(touch) {
        const touchX = touch.clientX;
        const touchY = touch.clientY;
        
        const deltaX = touchX - baseCenterX;
        const deltaY = touchY - baseCenterY;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        
        let stickX = deltaX;
        let stickY = deltaY;
        
        if (distance > maxDistance) {
            const angle = Math.atan2(deltaY, deltaX);
            stickX = Math.cos(angle) * maxDistance;
            stickY = Math.sin(angle) * maxDistance;
        }
        
        joystickStick.style.transform = `translate(${stickX}px, ${stickY}px)`;
        
        const normalizedX = stickX / maxDistance;
        const normalizedY = stickY / maxDistance;
        
        moveForward = normalizedY < -0.3;
        moveBackward = normalizedY > 0.3;
        moveLeft = normalizedX < -0.3;
        moveRight = normalizedX > 0.3;
    }

    function resetJoystick() {
        joystickStick.style.transform = 'translate(0, 0)';
        moveForward = moveBackward = moveLeft = moveRight = false;
    }

    joystickBase.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        const rect = joystickBase.getBoundingClientRect();
        const touchX = touch.clientX;
        const touchY = touch.clientY;
        
        if (touchX >= rect.left && touchX <= rect.right && 
            touchY >= rect.top && touchY <= rect.bottom) {
            activeTouches.set(touch.identifier, { 
                type: 'joystick', 
                element: joystickBase
            });
            updateJoystick(touch);
        }
    });
}

// Инициализация поворота камеры и стрельбы
function initCameraControls() {
    const cameraArea = document.getElementById('cameraTouchArea');
    const shootButton = document.getElementById('shootButton');

    cameraArea.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        
        const shootRect = shootButton.getBoundingClientRect();
        const touchX = touch.clientX;
        const touchY = touch.clientY;
        
        if (!(touchX >= shootRect.left && touchX <= shootRect.right && 
              touchY >= shootRect.top && touchY <= shootRect.bottom)) {
            activeTouches.set(touch.identifier, { 
                type: 'camera', 
                element: cameraArea,
                lastX: touch.clientX,
                lastY: touch.clientY
            });
            lastCameraTouchX = touch.clientX;
            lastCameraTouchY = touch.clientY;
        }
    });

    shootButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        
        shootTouchId = touch.identifier;
        isShootingTouch = true;
        lastCameraTouchX = touch.clientX;
        lastCameraTouchY = touch.clientY;
        
        playShootAnimation();
    });

    shootButton.addEventListener('touchend', (e) => {
        e.preventDefault();
        for (let touch of e.changedTouches) {
            if (touch.identifier === shootTouchId) {
                isShootingTouch = false;
                shootTouchId = null;
                break;
            }
        }
    });
}

// ОБЩИЕ ОБРАБОТЧИКИ
function initGlobalHandlers() {
    document.addEventListener('touchmove', (e) => {
        e.preventDefault();
        
        for (let touch of e.touches) {
            const touchData = activeTouches.get(touch.identifier);
            
            if (touchData && touchData.type === 'joystick') {
                const joystickStick = document.getElementById('joystickStick');
                const joystickBase = document.getElementById('movementJoystick');
                
                let baseRect = joystickBase.getBoundingClientRect();
                const baseCenterX = baseRect.left + baseRect.width / 2;
                const baseCenterY = baseRect.top + baseRect.height / 2;
                const maxDistance = baseRect.width / 3;
                
                const deltaX = touch.clientX - baseCenterX;
                const deltaY = touch.clientY - baseCenterY;
                const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
                
                let stickX = deltaX;
                let stickY = deltaY;
                
                if (distance > maxDistance) {
                    const angle = Math.atan2(deltaY, deltaX);
                    stickX = Math.cos(angle) * maxDistance;
                    stickY = Math.sin(angle) * maxDistance;
                }
                
                joystickStick.style.transform = `translate(${stickX}px, ${stickY}px)`;
                
                const normalizedX = stickX / maxDistance;
                const normalizedY = stickY / maxDistance;
                
                moveForward = normalizedY < -0.3;
                moveBackward = normalizedY > 0.3;
                moveLeft = normalizedX < -0.3;
                moveRight = normalizedX > 0.3;
                
            } else if (touchData && touchData.type === 'camera') {
                if (touchData.lastX && touchData.lastY) {
                    const deltaX = touch.clientX - touchData.lastX;
                    const deltaY = touch.clientY - touchData.lastY;
                    
                    yaw -= deltaX * mouseSensitivity * 2;
                    pitch -= deltaY * mouseSensitivity * 2;
                    pitch = Math.max(-PI_2, Math.min(PI_2, pitch));
                }
                
                touchData.lastX = touch.clientX;
                touchData.lastY = touch.clientY;
            }
            
            if (touch.identifier === shootTouchId && isShootingTouch) {
                const deltaX = touch.clientX - lastCameraTouchX;
                const deltaY = touch.clientY - lastCameraTouchY;
                
                yaw -= deltaX * mouseSensitivity * 1.5;
                pitch -= deltaY * mouseSensitivity * 1.5;
                pitch = Math.max(-PI_2, Math.min(PI_2, pitch));
                
                lastCameraTouchX = touch.clientX;
                lastCameraTouchY = touch.clientY;
            }
        }
    });

    document.addEventListener('touchend', (e) => {
        for (let touch of e.changedTouches) {
            const touchData = activeTouches.get(touch.identifier);
            if (touchData) {
                if (touchData.type === 'joystick') {
                    const joystickStick = document.getElementById('joystickStick');
                    joystickStick.style.transform = 'translate(0, 0)';
                    moveForward = moveBackward = moveLeft = moveRight = false;
                }
                activeTouches.delete(touch.identifier);
            }
            
            if (touch.identifier === shootTouchId) {
                isShootingTouch = false;
                shootTouchId = null;
            }
        }
    });

    window.addEventListener('blur', () => {
        activeTouches.clear();
        const joystickStick = document.getElementById('joystickStick');
        joystickStick.style.transform = 'translate(0, 0)';
        moveForward = moveBackward = moveLeft = moveRight = false;
        isShootingTouch = false;
        shootTouchId = null;
        stopAutoShoot();
        isMouseDown = false;
    });

    document.addEventListener('mousedown', (e) => {
        if (e.button === 0 && 
            document.getElementById('startMenu').style.display === 'none' &&
            document.getElementById('optionsMenu').style.display === 'none' &&
            document.getElementById('modeSelectMenu').style.display === 'none') {
            e.preventDefault();
            isMouseDown = true;
            playShootAnimation();
            startAutoShoot();
        }
    });

    document.addEventListener('mouseup', (e) => {
        if (e.button === 0) {
            isMouseDown = false;
            stopAutoShoot();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.code === 'KeyR' && 
            document.getElementById('startMenu').style.display === 'none' &&
            document.getElementById('optionsMenu').style.display === 'none' &&
            document.getElementById('modeSelectMenu').style.display === 'none') {
            if (!isReloading && ammo < maxAmmo) {
                playReloadAnimation();
            }
        }
    });
}

// Инициализация управления
function initControls() {
    initJoystick();
    initCameraControls();
    initGlobalHandlers();

    window.addEventListener('keydown', (event) => {
        if (document.getElementById('startMenu').style.display === 'none' &&
            document.getElementById('optionsMenu').style.display === 'none' &&
            document.getElementById('modeSelectMenu').style.display === 'none') {
            switch(event.code) {
                case 'KeyW': moveForward = true; break;
                case 'KeyS': moveBackward = true; break;
                case 'KeyA': moveLeft = true; break;
                case 'KeyD': moveRight = true; break;
            }
        }
    });
    
    window.addEventListener('keyup', (event) => {
        if (document.getElementById('startMenu').style.display === 'none' &&
            document.getElementById('optionsMenu').style.display === 'none' &&
            document.getElementById('modeSelectMenu').style.display === 'none') {
            switch(event.code) {
                case 'KeyW': moveForward = false; break;
                case 'KeyS': moveBackward = false; break;
                case 'KeyA': moveLeft = false; break;
                case 'KeyD': moveRight = false; break;
            }
        }
    });

    document.addEventListener('mousemove', (event) => {
        if (document.getElementById('startMenu').style.display === 'none' &&
            document.getElementById('optionsMenu').style.display === 'none' &&
            document.getElementById('modeSelectMenu').style.display === 'none' && 
            document.pointerLockElement === renderer.domElement) {
            yaw -= event.movementX * mouseSensitivity;
            pitch -= event.movementY * mouseSensitivity;
            pitch = Math.max(-PI_2, Math.min(PI_2, pitch));
        }
    });

    renderer.domElement.addEventListener('click', () => {
        if (document.getElementById('startMenu').style.display === 'none' &&
            document.getElementById('optionsMenu').style.display === 'none' &&
            document.getElementById('modeSelectMenu').style.display === 'none') {
            renderer.domElement.requestPointerLock();
        }
    });
}

// Проверка коллизий
function checkCollision(newX, newZ) {
    const playerRadius = 0.3;
    const points = [
        [newX - playerRadius, newZ],
        [newX + playerRadius, newZ],
        [newX, newZ - playerRadius],
        [newX, newZ + playerRadius]
    ];
    
    for (let [px, pz] of points) {
        const mazeX = Math.round((px / CELL_SIZE) + maze[0].length/2);
        const mazeZ = Math.round((pz / CELL_SIZE) + maze.length/2);
        
        if (mazeZ >= 0 && mazeZ < maze.length && 
            mazeX >= 0 && mazeX < maze[0].length) {
            if (maze[mazeZ][mazeX] === 1) {
                return true;
            }
        } else {
            return true;
        }
    }
    
    return false;
}

// Проверка достижения выхода (для режима Straight Through)
function checkExitReached() {
    if (currentGameMode !== 'straight' || !exitArea) return false;
    
    const dx = camera.position.x - exitArea.position.x;
    const dz = camera.position.z - exitArea.position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    
    return distance < CELL_SIZE;
}

// СИСТЕМА НАВИГАЦИИ ДЛЯ ВРАГОВ
class NavigationSystem {
    constructor() {
        this.nodes = [];
        this.edges = [];
        this.gridSize = 1.0;
        this.generateNavigationGraph();
    }
    
    generateNavigationGraph() {
        for (let y = 0; y < maze.length; y++) {
            for (let x = 0; x < maze[y].length; x++) {
                if (maze[y][x] === 0) {
                    const worldX = (x - maze[0].length/2) * CELL_SIZE;
                    const worldZ = (y - maze.length/2) * CELL_SIZE;
                    
                    this.nodes.push({
                        x: worldX,
                        z: worldZ,
                        id: this.nodes.length
                    });
                }
            }
        }
        
        for (let i = 0; i < this.nodes.length; i++) {
            const node = this.nodes[i];
            
            for (let j = 0; j < this.nodes.length; j++) {
                if (i === j) continue;
                
                const otherNode = this.nodes[j];
                const dx = otherNode.x - node.x;
                const dz = otherNode.z - node.z;
                const distance = Math.sqrt(dx * dx + dz * dz);
                
                if (distance <= CELL_SIZE * 1.5) {
                    const midX = (node.x + otherNode.x) / 2;
                    const midZ = (node.z + otherNode.z) / 2;
                    
                    const mazeX = Math.round((midX / CELL_SIZE) + maze[0].length/2);
                    const mazeZ = Math.round((midZ / CELL_SIZE) + maze.length/2);
                    
                    if (mazeZ >= 0 && mazeZ < maze.length && 
                        mazeX >= 0 && mazeX < maze[0].length &&
                        maze[mazeZ][mazeX] === 0) {
                        
                        this.edges.push({
                            from: node.id,
                            to: otherNode.id,
                            distance: distance
                        });
                    }
                }
            }
        }
        
        console.log(`Создана навигационная сеть: ${this.nodes.length} узлов, ${this.edges.length} связей`);
    }
    
    findPath(startX, startZ, targetX, targetZ) {
        const startNode = this.findNearestNode(startX, startZ);
        const targetNode = this.findNearestNode(targetX, targetZ);
        
        if (!startNode || !targetNode) return null;
        
        const openSet = [startNode];
        const closedSet = new Set();
        const cameFrom = new Map();
        const gScore = new Map();
        const fScore = new Map();
        
        gScore.set(startNode.id, 0);
        fScore.set(startNode.id, this.heuristic(startNode, targetNode));
        
        while (openSet.length > 0) {
            let current = openSet[0];
            let currentIndex = 0;
            
            for (let i = 1; i < openSet.length; i++) {
                if (fScore.get(openSet[i].id) < fScore.get(current.id)) {
                    current = openSet[i];
                    currentIndex = i;
                }
            }
            
            if (current.id === targetNode.id) {
                return this.reconstructPath(cameFrom, current);
            }
            
            openSet.splice(currentIndex, 1);
            closedSet.add(current.id);
            
            const neighbors = this.getNeighbors(current);
            
            for (let neighbor of neighbors) {
                if (closedSet.has(neighbor.id)) continue;
                
                const tentativeGScore = gScore.get(current.id) + this.getDistance(current, neighbor);
                
                if (!openSet.includes(neighbor)) {
                    openSet.push(neighbor);
                } else if (tentativeGScore >= gScore.get(neighbor.id)) {
                    continue;
                }
                
                cameFrom.set(neighbor.id, current);
                gScore.set(neighbor.id, tentativeGScore);
                fScore.set(neighbor.id, gScore.get(neighbor.id) + this.heuristic(neighbor, targetNode));
            }
        }
        
        return null;
    }
    
    findNearestNode(x, z) {
        let nearestNode = null;
        let minDistance = Infinity;
        
        for (let node of this.nodes) {
            const dx = node.x - x;
            const dz = node.z - z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            if (distance < minDistance) {
                minDistance = distance;
                nearestNode = node;
            }
        }
        
        return nearestNode;
    }
    
    getNeighbors(node) {
        const neighbors = [];
        
        for (let edge of this.edges) {
            if (edge.from === node.id) {
                const neighbor = this.nodes.find(n => n.id === edge.to);
                if (neighbor) neighbors.push(neighbor);
            }
        }
        
        return neighbors;
    }
    
    getDistance(nodeA, nodeB) {
        const dx = nodeA.x - nodeB.x;
        const dz = nodeA.z - nodeB.z;
        return Math.sqrt(dx * dx + dz * dz);
    }
    
    heuristic(nodeA, nodeB) {
        return this.getDistance(nodeA, nodeB);
    }
    
    reconstructPath(cameFrom, current) {
        const path = [current];
        
        while (cameFrom.has(current.id)) {
            current = cameFrom.get(current.id);
            path.unshift(current);
        }
        
        return path;
    }
}

// Создаем систему навигации
let navigationSystem = null;

// КЛАСС МОНЕТЫ
class Coin {
    constructor(x, z) {
        this.x = x;
        this.z = z;
        this.isCollected = false;
        this.animationFrame = 1;
        this.animationTimer = 0;
        
        this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({
            map: this.createCoinTexture(),
            transparent: true,
            fog: true
        }));
        
        this.sprite.position.set(this.x, 0.5, this.z);
        this.sprite.scale.set(2, 2, 1);
        scene.add(this.sprite);
    }
    
    createCoinTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const context = canvas.getContext('2d');
        
        const img = new Image();
        img.src = 'GameUi/Coin/1.png';
        
        context.fillStyle = 'transparent';
        context.fillRect(0, 0, 64, 64);
        context.drawImage(img, 0, 0, 64, 64);
        
        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    }
    
    update(deltaTime) {
        if (this.isCollected) return;
        
        this.animationTimer += deltaTime;
        if (this.animationTimer > 0.15) {
            this.animationTimer = 0;
            this.animationFrame = this.animationFrame % 4 + 1;
            this.updateCoinTexture();
        }
        
        this.sprite.rotation.y += deltaTime * 2;
    }
    
    updateCoinTexture() {
        const img = new Image();
        img.src = `GameUi/Coin/${this.animationFrame}.png`;
        
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 64;
            canvas.height = 64;
            const context = canvas.getContext('2d');
            context.fillStyle = 'transparent';
            context.fillRect(0, 0, 64, 64);
            context.drawImage(img, 0, 0, 64, 64);
            
            this.sprite.material.map = new THREE.CanvasTexture(canvas);
            this.sprite.material.needsUpdate = true;
        };
    }
    
    checkCollection(playerX, playerZ) {
        if (this.isCollected) return false;
        
        const dx = playerX - this.x;
        const dz = playerZ - this.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        
        if (distance < 1.5) {
            this.collect();
            return true;
        }
        
        return false;
    }
    
    collect() {
        this.isCollected = true;
        scene.remove(this.sprite);
        
        // Добавляем монету
        settingsManager.addCoins(1);
        
        // Воспроизводим звук
        if (coinSound) {
            coinSound.currentTime = 0;
            coinSound.play().catch(e => console.log('Не удалось воспроизвести звук монеты'));
        }
        
        const index = coins.indexOf(this);
        if (index > -1) {
            coins.splice(index, 1);
        }
    }
}

// Массив монет
let coins = [];

// КЛАСС ВРАГА
class Enemy {
    constructor(x, z) {
        this.x = x;
        this.z = z;
        this.health = 3;
        this.speed = currentGameMode === 'onslaught' ? 4.5 : 9.0;
        this.attackRange = 2.0;
        this.attackCooldown = 0;
        this.fireballCooldown = 0;
        this.isAlive = true;
        this.spriteFrame = 0;
        this.animationTimer = 0;
        this.lastPlayerX = 0;
        this.lastPlayerZ = 0;
        this.path = [];
        this.currentPathIndex = 0;
        this.pathUpdateTimer = 0;
        this.isDying = false;
        this.deathFrame = 0;
        this.deathTimer = 0;
        this.stuckTimer = 0;
        this.lastX = x;
        this.lastZ = z;
        this.avoidanceForce = new THREE.Vector2(0, 0);
        this.teleportTimer = 0;
        this.lastDistanceToPlayer = 0;
        
        this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({
            map: this.createEnemyTexture(),
            transparent: true,
            fog: true
        }));
        
        this.sprite.position.set(this.x, 0.8, this.z);
        this.sprite.scale.set(4.5, 4.5, 1);
        scene.add(this.sprite);
    }
    
    createEnemyTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const context = canvas.getContext('2d');
        
        const img = new Image();
        img.src = 'GameUi/Enemy/Imp/Front/1.png';
        
        context.fillStyle = 'transparent';
        context.fillRect(0, 0, 64, 64);
        context.drawImage(img, 0, 0, 64, 64);
        
        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    }
    
    update(deltaTime, playerX, playerZ) {
        if (!this.isAlive) return;
        
        if (this.isDying) {
            this.updateDeathAnimation(deltaTime);
            return;
        }
        
        this.lastX = this.x;
        this.lastZ = this.z;
        
        this.animationTimer += deltaTime;
        if (this.animationTimer > 0.3) {
            this.animationTimer = 0;
            this.spriteFrame = (this.spriteFrame + 1) % 2;
            this.updateSpriteTexture();
        }
        
        if (this.attackCooldown > 0) this.attackCooldown -= deltaTime;
        if (this.fireballCooldown > 0) this.fireballCooldown -= deltaTime;
        
        this.lastPlayerX = playerX;
        this.lastPlayerZ = playerZ;
        
        const dx = playerX - this.x;
        const dz = playerZ - this.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        this.lastDistanceToPlayer = distance;
        
        if (currentGameMode === 'onslaught' && distance > 70) {
            this.teleportTimer += deltaTime;
            if (this.teleportTimer > 20.0) {
                this.teleportToPlayer();
                this.teleportTimer = 0;
            }
        } else {
            this.teleportTimer = 0;
        }
        
        this.pathUpdateTimer += deltaTime;
        if (this.pathUpdateTimer > 2.0 || this.path.length === 0 || distance < 5) {
            this.pathUpdateTimer = 0;
            this.path = navigationSystem.findPath(this.x, this.z, playerX, playerZ) || [];
            this.currentPathIndex = 0;
        }
        
        if (this.path.length > 0 && this.currentPathIndex < this.path.length) {
            const targetNode = this.path[this.currentPathIndex];
            const targetX = targetNode.x;
            const targetZ = targetNode.z;
            
            const dxToNode = targetX - this.x;
            const dzToNode = targetZ - this.z;
            const distanceToNode = Math.sqrt(dxToNode * dxToNode + dzToNode * dzToNode);
            
            if (distanceToNode < 1.0) {
                this.currentPathIndex++;
            } else {
                let dirX = dxToNode / distanceToNode;
                let dirZ = dzToNode / distanceToNode;
                
                this.calculateAvoidanceForce();
                dirX += this.avoidanceForce.x * 0.5;
                dirZ += this.avoidanceForce.y * 0.5;
                
                const dirLength = Math.sqrt(dirX * dirX + dirZ * dirZ);
                if (dirLength > 0) {
                    dirX /= dirLength;
                    dirZ /= dirLength;
                }
                
                const newX = this.x + dirX * this.speed * deltaTime;
                const newZ = this.z + dirZ * this.speed * deltaTime;
                
                if (!this.checkWallCollision(newX, newZ)) {
                    this.x = newX;
                    this.z = newZ;
                } else {
                    this.handleWallCollision(dirX, dirZ, deltaTime);
                }
            }
        } else {
            if (distance > 0) {
                let dirX = dx / distance;
                let dirZ = dz / distance;
                
                this.calculateAvoidanceForce();
                dirX += this.avoidanceForce.x * 0.3;
                dirZ += this.avoidanceForce.y * 0.3;
                
                const dirLength = Math.sqrt(dirX * dirX + dirZ * dirZ);
                if (dirLength > 0) {
                    dirX /= dirLength;
                    dirZ /= dirLength;
                }
                
                const newX = this.x + dirX * this.speed * deltaTime;
                const newZ = this.z + dirZ * this.speed * deltaTime;
                
                if (!this.checkWallCollision(newX, newZ)) {
                    this.x = newX;
                    this.z = newZ;
                } else {
                    this.handleWallCollision(dirX, dirZ, deltaTime);
                }
            }
        }
        
        this.sprite.position.set(this.x, 0.8, this.z);
        this.sprite.lookAt(camera.position);
        
        const movedDistance = Math.sqrt(
            (this.x - this.lastX) * (this.x - this.lastX) + 
            (this.z - this.lastZ) * (this.z - this.lastZ)
        );
        
        if (movedDistance < 0.1 * deltaTime) {
            this.stuckTimer += deltaTime;
            if (this.stuckTimer > 2.0) {
                this.findAlternativePath();
                this.stuckTimer = 0;
            }
        } else {
            this.stuckTimer = 0;
        }
        
        if (distance < this.attackRange && this.attackCooldown <= 0) {
            this.meleeAttack();
            this.attackCooldown = 1.0;
        }
        
        if (distance < 15 && this.fireballCooldown <= 0 && distance > this.attackRange) {
            this.throwFireball(playerX, playerZ);
            this.fireballCooldown = 5.0;
        }
    }
    
    teleportToPlayer() {
        const playerMazeX = Math.round((camera.position.x / CELL_SIZE) + maze[0].length/2);
        const playerMazeZ = Math.round((camera.position.z / CELL_SIZE) + maze.length/2);
        
        let freeCells = [];
        const searchRadius = 5;
        
        for (let z = playerMazeZ - searchRadius; z <= playerMazeZ + searchRadius; z++) {
            for (let x = playerMazeX - searchRadius; x <= playerMazeX + searchRadius; x++) {
                if (z >= 0 && z < maze.length && x >= 0 && x < maze[0].length) {
                    if (maze[z][x] === 0) {
                        const worldX = (x - maze[0].length/2) * CELL_SIZE;
                        const worldZ = (z - maze.length/2) * CELL_SIZE;
                        const distanceToPlayer = Math.sqrt(
                            (worldX - camera.position.x) * (worldX - camera.position.x) + 
                            (worldZ - camera.position.z) * (worldZ - camera.position.z)
                        );
                        
                        if (distanceToPlayer > 20 && distanceToPlayer < 30) {
                            freeCells.push({x: worldX, z: worldZ});
                        }
                    }
                }
            }
        }
        
        if (freeCells.length > 0) {
            const randomCell = freeCells[Math.floor(Math.random() * freeCells.length)];
            this.x = randomCell.x;
            this.z = randomCell.z;
            this.sprite.position.set(this.x, 0.8, this.z);
            this.path = [];
        }
    }
    
    calculateAvoidanceForce() {
        this.avoidanceForce.set(0, 0);
        const avoidanceRadius = 3.0;
        
        for (let enemy of enemies) {
            if (enemy === this || !enemy.isAlive) continue;
            
            const dx = enemy.x - this.x;
            const dz = enemy.z - this.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            if (distance < avoidanceRadius && distance > 0) {
                const force = (avoidanceRadius - distance) / avoidanceRadius;
                this.avoidanceForce.x -= (dx / distance) * force;
                this.avoidanceForce.y -= (dz / distance) * force;
            }
        }
    }
    
    handleWallCollision(dirX, dirZ, deltaTime) {
        const directions = [
            [dirZ, -dirX],
            [-dirZ, dirX],
            [dirX * 0.7, dirZ * 0.7],
            [-dirX * 0.5, -dirZ * 0.5]
        ];
        
        for (let [testX, testZ] of directions) {
            const newX = this.x + testX * this.speed * deltaTime;
            const newZ = this.z + testZ * this.speed * deltaTime;
            
            if (!this.checkWallCollision(newX, newZ)) {
                this.x = newX;
                this.z = newZ;
                return;
            }
        }
    }
    
    findAlternativePath() {
        this.path = [];
        this.pathUpdateTimer = 2.0;
    }
    
    checkWallCollision(x, z) {
        const enemyRadius = 0.5;
        const points = [
            [x - enemyRadius, z],
            [x + enemyRadius, z],
            [x, z - enemyRadius],
            [x, z + enemyRadius]
        ];
        
        for (let [px, pz] of points) {
            const mazeX = Math.round((px / CELL_SIZE) + maze[0].length/2);
            const mazeZ = Math.round((pz / CELL_SIZE) + maze.length/2);
            
            if (mazeZ >= 0 && mazeZ < maze.length && 
                mazeX >= 0 && mazeX < maze[0].length) {
                if (maze[mazeZ][mazeX] === 1) {
                    return true;
                }
            } else {
                return true;
            }
        }
        
        return false;
    }
    
    meleeAttack() {
        const dx = this.lastPlayerX - this.x;
        const dz = this.lastPlayerZ - this.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        
        if (distance < this.attackRange) {
            takeDamage(10);
        }
    }
    
    throwFireball(playerX, playerZ) {
        const fireball = new Fireball(this.x, this.z, playerX, playerZ);
        fireballs.push(fireball);
    }
    
    updateSpriteTexture() {
        const frame = this.spriteFrame + 1;
        const img = new Image();
        img.src = `GameUi/Enemy/Imp/Front/${frame}.png`;
        
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 64;
            canvas.height = 64;
            const context = canvas.getContext('2d');
            context.fillStyle = 'transparent';
            context.fillRect(0, 0, 64, 64);
            context.drawImage(img, 0, 0, 64, 64);
            
            this.sprite.material.map = new THREE.CanvasTexture(canvas);
            this.sprite.material.needsUpdate = true;
        };
    }
    
    takeDamage(amount, distance) {
        let damage = 0;
        
        if (distance < 4) {
            damage = 3;
        } else if (distance < 10) {
            damage = 2;
        } else {
            damage = 1;
        }
        
        this.health -= damage;
        
        if (Math.random() > 0.5) {
            if (impDamageSound1) {
                impDamageSound1.currentTime = 0;
                impDamageSound1.play().catch(e => console.log('Не удалось воспроизвести звук получения урона врагом'));
            }
        } else {
            if (impDamageSound2) {
                impDamageSound2.currentTime = 0;
                impDamageSound2.play().catch(e => console.log('Не удалось воспроизвести звук получения урона врагом'));
            }
        }
        
        if (this.health <= 0 && !this.isDying) {
            this.startDeath();
        }
    }
    
    startDeath() {
        this.isDying = true;
        this.deathFrame = 1;
        this.deathTimer = 0;
        
        // Создаем монету при смерти врага
        createCoinFromEnemy(this.x, this.z);
        
        const deathSounds = [impDeathSound1, impDeathSound2, impDeathSound3];
        const randomSound = deathSounds[Math.floor(Math.random() * deathSounds.length)];
        
        if (randomSound) {
            randomSound.currentTime = 0;
            randomSound.play().catch(e => console.log('Не удалось воспроизвести звук смерти врага'));
        }
        
        this.updateDeathTexture();
    }
    
    updateDeathAnimation(deltaTime) {
        this.deathTimer += deltaTime;
        
        if (this.deathTimer > 0.2) {
            this.deathTimer = 0;
            this.deathFrame++;
            
            if (this.deathFrame <= 3) {
                this.updateDeathTexture();
            } else {
                this.finalizeDeath();
            }
        }
    }
    
    updateDeathTexture() {
        const img = new Image();
        img.src = `GameUi/Enemy/Imp/Front/Die${this.deathFrame}.png`;
        
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 64;
            canvas.height = 64;
            const context = canvas.getContext('2d');
            context.fillStyle = 'transparent';
            context.fillRect(0, 0, 64, 64);
            context.drawImage(img, 0, 0, 64, 64);
            
            this.sprite.material.map = new THREE.CanvasTexture(canvas);
            this.sprite.material.needsUpdate = true;
        };
    }
    
    finalizeDeath() {
        this.isAlive = false;
        scene.remove(this.sprite);
        
        const index = enemies.indexOf(this);
        if (index > -1) {
            enemies.splice(index, 1);
        }
        
        enemiesKilled++;
        updateUI();
        
        if (currentGameMode === 'extermination' && enemiesKilled >= targetEnemies) {
            victory();
        }
        
        if (currentGameMode === 'onslaught') {
            waveEnemiesKilled++;
            // В Onslaught проверяем завершение волны
            if (waveEnemiesKilled >= waveEnemiesCount && enemies.length === 0) {
                nextWave();
            }
        }
    }
}

// Создание монеты при смерти врага
function createCoinFromEnemy(x, z) {
    coins.push(new Coin(x, z));
}

// КЛАСС ФАЙРБОЛА
class Fireball {
    constructor(x, z, targetX, targetZ) {
        this.x = x;
        this.z = z;
        this.speed = 12.0;
        this.isActive = true;
        this.damage = Math.round((20 + Math.random() * 20) / 5) * 5;
        
        const dx = targetX - x;
        const dz = targetZ - z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        this.dirX = dx / distance;
        this.dirZ = dz / distance;
        
        this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({
            map: textureLoader.load('GameUi/Enemy/Imp/Fireball.png'),
            transparent: true,
            fog: true
        }));
        
        this.sprite.position.set(this.x, 0.8, this.z);
        this.sprite.scale.set(3.5, 3.5, 1);
        scene.add(this.sprite);
        
        this.rotation = 0;
    }
    
    update(deltaTime) {
        if (!this.isActive) return;
        
        this.x += this.dirX * this.speed * deltaTime;
        this.z += this.dirZ * this.speed * deltaTime;
        
        this.sprite.position.set(this.x, 0.8, this.z);
        
        this.rotation += 15 * deltaTime;
        this.sprite.rotation.z = this.rotation;
        
        if (this.checkWallCollision()) {
            this.destroy();
            return;
        }
        
        const dx = this.x - camera.position.x;
        const dz = this.z - camera.position.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        
        if (distance < 2.0) {
            this.destroy();
            takeDamage(this.damage);
        }
    }
    
    checkWallCollision() {
        const fireballRadius = 0.8;
        const points = [
            [this.x - fireballRadius, this.z],
            [this.x + fireballRadius, this.z],
            [this.x, this.z - fireballRadius],
            [this.x, this.z + fireballRadius]
        ];
        
        for (let [px, pz] of points) {
            const mazeX = Math.round((px / CELL_SIZE) + maze[0].length/2);
            const mazeZ = Math.round((pz / CELL_SIZE) + maze.length/2);
            
            if (mazeZ >= 0 && mazeZ < maze.length && 
                mazeX >= 0 && mazeX < maze[0].length) {
                if (maze[mazeZ][mazeX] === 1) {
                    return true;
                }
            } else {
                return true;
            }
        }
        
        return false;
    }
    
    destroy() {
        this.isActive = false;
        scene.remove(this.sprite);
        
        const index = fireballs.indexOf(this);
        if (index > -1) {
            fireballs.splice(index, 1);
        }
    }
}

// Массивы для врагов и файрболов
let enemies = [];
let fireballs = [];

// Функция создания врагов - ИСПРАВЛЕННАЯ
function createEnemies(count, mode = 'normal') {
    for (let i = 0; i < count; i++) {
        let freeCells = [];
        
        for (let y = 1; y < maze.length - 1; y++) {
            for (let x = 1; x < maze[y].length - 1; x++) {
                if (maze[y][x] === 0) {
                    const worldX = (x - maze[0].length/2) * CELL_SIZE;
                    const worldZ = (y - maze.length/2) * CELL_SIZE;
                    const dx = worldX - camera.position.x;
                    const dz = worldZ - camera.position.z;
                    const distance = Math.sqrt(dx * dx + dz * dz);
                    
                    // Враги появляются ДАЛЕКО от игрока
                    if (distance > 10) {
                        freeCells.push({x: worldX, z: worldZ});
                    }
                }
            }
        }
        
        if (freeCells.length > 0) {
            const randomCell = freeCells[Math.floor(Math.random() * freeCells.length)];
            enemies.push(new Enemy(randomCell.x, randomCell.z));
        }
    }
}

// Функция получения урона игроком
function takeDamage(amount) {
    const roundedDamage = Math.round(amount);
    hp -= roundedDamage;
    if (hp < 0) hp = 0;
    
    updateUI();
    
    if (playerHitSound) {
        playerHitSound.currentTime = 0;
        playerHitSound.play().catch(e => console.log('Не удалось воспроизвести звук получения урона'));
    }
    
    showDamageEffect();
    
    if (hp <= 0) {
        gameOver();
    }
}

// Функция показа эффекта получения урона
function showDamageEffect() {
    const damageEffect = document.getElementById('damageEffect');
    damageEffect.style.display = 'block';
    damageEffect.style.opacity = '0.7';
    
    setTimeout(() => {
        damageEffect.style.opacity = '0';
        setTimeout(() => {
            damageEffect.style.display = 'none';
        }, 300);
    }, 300);
}

// Функция завершения игры
function gameOver() {
    alert('Игра окончена! Вы погибли.');
    location.reload();
}

// Функция победы
function victory() {
    let coinsEarned = 0;
    
    if (currentGameMode === 'extermination') {
        coinsEarned = 0; // В этом режиме монеты собираются с убитых врагов
    } else if (currentGameMode === 'straight') {
        coinsEarned = 20; // 20 монет за победу в гонке
        settingsManager.addCoins(coinsEarned);
    } else if (currentGameMode === 'onslaught') {
        coinsEarned = 0; // В этом режиме монеты собираются с убитых врагов
    }
    
    alert(`Поздравляем! Вы победили в режиме ${getModeName(currentGameMode)}!${coinsEarned > 0 ? ` Заработано монет: ${coinsEarned}` : ''}`);
    location.reload();
}

// Функция получения названия режима
function getModeName(mode) {
    switch(mode) {
        case 'extermination': return 'Extermination Protocol';
        case 'straight': return 'Straight Through';
        case 'onslaught': return 'Onslaught';
        default: return 'Unknown';
    }
}

// Функция проверки попадания по врагам
function checkEnemyHit() {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    
    raycaster.far = 50;
    
    for (let enemy of enemies) {
        if (!enemy.isAlive) continue;
        
        const enemySphere = new THREE.Sphere(
            new THREE.Vector3(enemy.x, 0.8, enemy.z),
            2.0
        );
        
        if (raycaster.ray.intersectsSphere(enemySphere)) {
            const dx = enemy.x - camera.position.x;
            const dz = enemy.z - camera.position.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            enemy.takeDamage(1, distance);
            return true;
        }
    }
    
    const intersects = [];
    for (let enemy of enemies) {
        if (!enemy.isAlive) continue;
        
        const enemyBox = new THREE.Box3().setFromCenterAndSize(
            new THREE.Vector3(enemy.x, 0.8, enemy.z),
            new THREE.Vector3(2.0, 2.0, 2.0)
        );
        
        if (raycaster.ray.intersectsBox(enemyBox)) {
            const dx = enemy.x - camera.position.x;
            const dz = enemy.z - camera.position.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            enemy.takeDamage(1, distance);
            return true;
        }
    }
    
    return false;
}

// Система волн для режима Onslaught - ИСПРАВЛЕННАЯ
function startWave(waveNumber) {
    currentWave = waveNumber;
    waveEnemiesKilled = 0;
    
    // В Onslaught: 1 волна - 1 враг, 2 волна - 2 врага и т.д.
    waveEnemiesCount = waveNumber;
    enemiesToSpawn = waveEnemiesCount;
    lastSpawnTime = 0;
    
    const waveInfo = document.getElementById('waveInfo');
    waveInfo.textContent = `Волна ${waveNumber}`;
    waveInfo.style.display = 'block';
    
    setTimeout(() => {
        waveInfo.style.display = 'none';
    }, 2000);
    
    updateUI();
}

function nextWave() {
    currentWave++;
    startWave(currentWave);
}

// Функция постепенного спавна врагов в режиме Onslaught
function spawnEnemiesOverTime(currentTime) {
    if (currentGameMode !== 'onslaught' || enemiesToSpawn <= 0) return;
    
    if (currentTime - lastSpawnTime > SPAWN_INTERVAL) {
        const spawnCount = Math.min(1, enemiesToSpawn);
        
        let freeCells = [];
        for (let y = 1; y < maze.length - 1; y++) {
            for (let x = 1; x < maze[y].length - 1; x++) {
                if (maze[y][x] === 0) {
                    const worldX = (x - maze[0].length/2) * CELL_SIZE;
                    const worldZ = (y - maze.length/2) * CELL_SIZE;
                    const dx = worldX - camera.position.x;
                    const dz = worldZ - camera.position.z;
                    const distance = Math.sqrt(dx * dx + dz * dz);
                    
                    // Враги появляются ДАЛЕКО от игрока
                    if (distance > 10) {
                        freeCells.push({x: worldX, z: worldZ});
                    }
                }
            }
        }
        
        if (freeCells.length > 0) {
            for (let i = 0; i < spawnCount; i++) {
                const randomCell = freeCells[Math.floor(Math.random() * freeCells.length)];
                enemies.push(new Enemy(randomCell.x, randomCell.z));
                enemiesToSpawn--;
            }
        }
        
        lastSpawnTime = currentTime;
    }
}

// Функция респавна врагов в Extermination - ИСПРАВЛЕННАЯ
function respawnEnemiesInExtermination() {
    if (currentGameMode !== 'extermination') return;
    
    // Всегда поддерживаем 5 врагов на карте
    if (enemies.length < 5) {
        const enemiesToRespawn = 5 - enemies.length;
        createEnemies(enemiesToRespawn, 'extermination');
    }
}

// Функция респавна врагов в Straight Through
function respawnEnemiesInStraightThrough() {
    if (currentGameMode !== 'straight') return;
    
    if (enemies.length < 5) {
        const enemiesToRespawn = 5 - enemies.length;
        createEnemies(enemiesToRespawn, 'straight');
    }
}

// Анимация с delta time для независимой от FPS скорости
const BASE_MOVE_SPEED = 15.0;

function animate(currentTime) {
    requestAnimationFrame(animate);
    
    const deltaTime = Math.min((currentTime - lastTime) / 1000, 0.1);
    lastTime = currentTime;
    
    frameCount++;
    if (currentTime > lastTime + 1000) {
        fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
        frameCount = 0;
        lastTime = currentTime;
        fpsCounter.textContent = `FPS: ${fps}`;
    }
    
    camera.rotation.order = 'YXZ';
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
    
    const direction = new THREE.Vector3();
    
    const actualMoveSpeed = BASE_MOVE_SPEED * deltaTime;
    
    if (moveForward) direction.z -= actualMoveSpeed;
    if (moveBackward) direction.z += actualMoveSpeed;
    if (moveLeft) direction.x -= actualMoveSpeed;
    if (moveRight) direction.x += actualMoveSpeed;
    
    direction.applyEuler(new THREE.Euler(0, yaw, 0));
    
    let newX = camera.position.x;
    let newZ = camera.position.z;
    
    if (!checkCollision(newX + direction.x, newZ)) {
        newX += direction.x;
    }
    if (!checkCollision(newX, newZ + direction.z)) {
        newZ += direction.z;
    }
    
    camera.position.x = newX;
    camera.position.z = newZ;
    
    // Проверяем сбор монет
    for (let i = coins.length - 1; i >= 0; i--) {
        coins[i].update(deltaTime);
        coins[i].checkCollection(camera.position.x, camera.position.z);
    }
    
    // Проверяем достижение выхода в режиме Straight Through
    if (currentGameMode === 'straight' && checkExitReached()) {
        victory();
        return;
    }
    
    // Обновляем стрелку выхода
    if (currentGameMode === 'straight') {
        updateExitArrow();
    }
    
    // Постепенный спавн врагов в режиме Onslaught
    if (currentGameMode === 'onslaught') {
        spawnEnemiesOverTime(currentTime);
    }
    
    // Респавн врагов в Extermination
    if (currentGameMode === 'extermination') {
        respawnEnemiesInExtermination();
    }
    
    // Респавн врагов в Straight Through
    if (currentGameMode === 'straight') {
        respawnEnemiesInStraightThrough();
    }
    
    // Обновляем врагов
    for (let enemy of enemies) {
        enemy.update(deltaTime, camera.position.x, camera.position.z);
    }
    
    // Обновляем файрболы
    for (let i = fireballs.length - 1; i >= 0; i--) {
        fireballs[i].update(deltaTime);
    }
    
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Функция запуска игры
function startGame() {
    document.getElementById('startMenu').style.display = 'none';
    document.getElementById('optionsMenu').style.display = 'none';
    document.getElementById('modeSelectMenu').style.display = 'none';
    fpsCounter.style.display = 'block';
    document.getElementById('uiPanel').style.display = 'block';
    document.getElementById('modeStats').style.display = 'block';
    document.getElementById('damageEffect').style.display = 'none';
    document.getElementById('coinCounter').style.display = 'flex';
    
    updateCoinCounter();
    
    if ('ontouchstart' in window || navigator.maxTouchPoints) {
        document.getElementById('mobileControls').style.display = 'block';
    }
    
    weapon.style.display = 'block';
    
    // СБРОС СОСТОЯНИЯ ОРУЖИЯ ПРИ СТАРТЕ ИГРЫ
    ammo = maxAmmo;
    isShooting = false;
    isReloading = false;
    canShoot = true;
    weapon.src = gunImages.normal;
    isMouseDown = false;
    stopAutoShoot();
    
    // Сбрасываем статистику
    enemiesKilled = 0;
    currentWave = 1;
    
    // Устанавливаем HP в зависимости от режима
    if (currentGameMode === 'straight') {
        hp = 35;
    } else {
        hp = 100;
    }
    
    // Создаем врагов в зависимости от режима
    if (currentGameMode === 'extermination') {
        createEnemies(5, 'extermination'); // Начинаем с 5 врагов
    } else if (currentGameMode === 'onslaught') {
        startWave(1); // 1 волна = 1 враг
    } else if (currentGameMode === 'straight') {
        createEnemies(5, 'straight');
    }
    
    updateUI();
    
    lastTime = performance.now();
    animate(performance.now());
}
