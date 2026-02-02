const express = require('express');
const path = require('path');
const http = require('http'); // 1. 引入 http
const { Server } = require('socket.io'); // 2. 引入 socket.io

const app = express();
const server = http.createServer(app); // 3. 建立 http server
const io = new Server(server); // 4. 初始化 socket.io

// 提供 public 靜態檔案
app.use(express.static(path.join(__dirname, '..', 'public')));

// 引入你的遊戲引擎邏輯 (根據截圖)
const engine = require('./game/engine');

// Socket.io 邏輯處理
io.on('connection', (socket) => {
    console.log('玩家連線:', socket.id);

    // 這裡要對應你 client.js 裡的 emit 名稱
    socket.on('create_room', ({ roomId, name }) => {
        socket.join(roomId);
        // ...處理房間邏輯
    });

    socket.on('join_room', ({ roomId, name }) => {
        socket.join(roomId);
        // ...處理加入邏輯
    });

    // ... 其他事件處理 (play_cards, pass 等)
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { // 5. 改用 server.listen
    console.log(`Server listening on port ${PORT}`);
});
