const express = require('express');
const path = require('path');
const fs = require('fs'); // [추가] 파일 시스템 모듈
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 데이터 저장 파일 경로
const DB_FILE = path.join(__dirname, 'users.json');

// [추가] 서버 시작 시 파일에서 데이터 로드
let users = [];
if (fs.existsSync(DB_FILE)) {
    try {
        users = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
        console.error("데이터 로드 실패, 초기값 사용");
    }
}

// [추가] 데이터를 파일로 저장하는 함수
function saveData() {
    fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
}

// 1. 경험치 곡선 공식
function getRequiredExp(level) {
    if (level >= 70) return Infinity;
    return Math.floor(100 * Math.pow(level, 2.5));
}

// 2. 회원가입 및 로그인 API
app.post('/api/auth/register', (req, res) => {
    const { username, password, nickname } = req.body;
    if (users.find(u => u.username === username)) return res.status(400).json({ message: "이미 존재하는 ID입니다." });
    
    const newUser = {
        _id: 'user_' + Date.now(), username, password, nickname,
        character: { hasCharacter: false, job: '', tier: 1, level: 1, exp: 0, gold: 1000, statPoints: 0, stats: { speed: 10, hp: 10, atk: 10, magic: 10 }, upgrades: { characterStatEff: 0 } },
        inventory: { equipment: [], pets: [] },
        friends: []
    };
    users.push(newUser);
    saveData(); // 데이터 저장
    res.json({ success: true, message: "회원가입 완료!" });
});

app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) return res.status(400).json({ message: "아이디 또는 비밀번호가 틀렸습니다." });
    res.json({ success: true, user });
});

// 3. 직업 선택 API
app.post('/api/char/select-job', (req, res) => {
    const { username, job } = req.body;
    const user = users.find(u => u.username === username);
    if (!user) return res.status(404).json({ message: "유저를 찾을 수 없습니다." });
    
    user.character.job = job;
    user.character.hasCharacter = true;
    saveData(); // 데이터 저장
    res.json({ success: true, character: user.character });
});

// 4. 전투 보상 지급 API
app.post('/api/battle/reward', (req, res) => {
    const { username, battleType, stageIndex, raidDifficulty } = req.body;
    const user = users.find(u => u.username === username);
    if (!user) return res.status(404).json({ message: "유저 없음" });
    
    let rewardGold = battleType === 'boss' ? stageIndex * 50 : (raidDifficulty === 'high' ? 600 : 200);
    let rewardExp = battleType === 'boss' ? stageIndex * 30 : (raidDifficulty === 'high' ? 450 : 150);

    let char = user.character;
    char.gold += rewardGold;
    char.exp += rewardExp;

    while (char.level < 70 && char.exp >= getRequiredExp(char.level)) {
        char.exp -= getRequiredExp(char.level);
        char.level++;
        char.statPoints += 4;
        if (char.level >= 40 && char.tier === 1) char.tier = 2;
    }
    
    saveData(); // 데이터 저장
    res.json({ success: true, rewardGold, rewardExp, character: char });
});

// 5. 강화 확률 계산 API
app.post('/api/upgrade/try', (req, res) => {
    const { username, type, targetId } = req.body;
    const user = users.find(u => u.username === username);
    if (!user || user.character.gold < 300) return res.status(400).json({ message: "골드 부족" });
    
    user.character.gold -= 300;
    const probability = [1.0, 0.8, 0.6, 0.4, 0.2];
    let currentLevel = type === 'character' ? user.character.upgrades.characterStatEff : 0;
    
    if (Math.random() < probability[currentLevel]) {
        if (type === 'character') user.character.upgrades.characterStatEff++;
    }
    
    saveData(); // 데이터 저장
    res.json({ success: true, currentLevel: user.character.upgrades.characterStatEff });
});

// 6. 랭킹 조회
app.get('/api/ranking', (req, res) => {
    const top10 = users.filter(u => u.character.hasCharacter)
        .sort((a, b) => b.character.level - a.character.level)
        .slice(0, 10);
    res.json(top10);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`RPG Server running on port ${PORT}`));