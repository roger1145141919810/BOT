const express = require('express');
const path = require('path');

const app = express();

// 提供 public 靜態檔案
app.use(express.static(path.join(__dirname, '..', 'public')));

// 範例首頁路由（若需要）
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// 監聽 Render 提供的 PORT 或 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
