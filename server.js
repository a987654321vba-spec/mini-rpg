const express = require('express');
const path = require('path'); // ◀ [추가] 이 줄을 새로 한 줄 넣으세요!
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // ◀ [추가] 이 줄도 새로 한 줄 넣으세요!

// 임시 인메모리 DB (실제 환경에서는 MongoDB/Firebase 연결)
let users = []; 

// 1. 경험치 곡선 공식 (Level 요구치 계산)
// 공식: ReqExp = 100 * (Level ^ 2.5)
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
    res.json({ success: true, character: user.character });
});

// 4. 전투 보상 지급 API (보스 및 레이드)
app.post('/api/battle/reward', (req, res) => {
    const { username, battleType, stageIndex, raidDifficulty } = req.body; // battleType: 'boss' 또는 'raid'
    const user = users.find(u => u.username === username);
    
    let rewardGold = 0;
    let rewardExp = 0;

    if (battleType === 'boss') {
        // 보스: 1~30단계 비례 증가
        rewardGold = stageIndex * 50;
        rewardExp = stageIndex * 30;
    } else if (battleType === 'raid') {
        // 레이드: 하(기본), 상(3배)
        rewardGold = raidDifficulty === 'high' ? 600 : 200;
        rewardExp = raidDifficulty === 'high' ? 450 : 150;
    }

    // 보상 반영 및 레벨업 체크
    let char = user.character;
    char.gold += rewardGold;
    char.exp += rewardExp;

    let leveledUp = false;
    while (char.level < 70 && char.exp >= getRequiredExp(char.level)) {
        char.exp -= getRequiredExp(char.level);
        char.level++;
        char.statPoints += 4;
        leveledUp = true;
        
        // 40레벨 자동 2차 전직 (외형 및 전직 상태 확정 안내 플래그)
        if (char.level >= 40 && char.tier === 1) {
            char.tier = 2;
        }
    }

    res.json({ success: true, rewardGold, rewardExp, character: char, leveledUp });
});

// 5. 강화 확률 계산 API (최대 5강)
app.post('/api/upgrade/try', (req, res) => {
    const { username, type, targetId } = req.body; // type: 'character', 'item', 'pet'
    const user = users.find(u => u.username === username);
    
    const cost = 300; // 강화 기본 비용
    if (user.character.gold < cost) return res.status(400).json({ message: "골드가 부족합니다." });
    user.character.gold -= cost;

    // 성공 확률 정의: 1강(100%), 2강(80%), 3강(60%), 4강(40%), 5강(20%)
    const probability = [1.0, 0.8, 0.6, 0.4, 0.2];
    
    let currentLevel = 0;
    let itemRef = null;

    if (type === 'item') {
        itemRef = user.inventory.equipment.find(e => e.id === targetId);
        if (!itemRef) return res.status(404).json({ message: "아이템을 찾을 수 없습니다." });
        currentLevel = itemRef.upgradeLevel;
    } else if (type === 'pet') {
        itemRef = user.inventory.pets.find(p => p.id === targetId);
        if (!itemRef) return res.status(404).json({ message: "펫을 찾을 수 없습니다." });
        currentLevel = itemRef.upgradeLevel;
    } else {
        currentLevel = user.character.upgrades.characterStatEff;
    }

    if (currentLevel >= 5) return res.status(400).json({ message: "이미 최대 강화 단계입니다." });

    const success = Math.random() < probability[currentLevel];
    if (success) {
        if (type === 'item' || type === 'pet') itemRef.upgradeLevel++;
        else user.character.upgrades.characterStatEff++;
    }

    res.json({ success, currentLevel: success ? currentLevel + 1 : currentLevel, gold: user.character.gold });
});

// 6. 랭킹 TOP 10 조회 API
app.get('/api/ranking', (req, res) => {
    const top10 = users
        .filter(u => u.character.hasCharacter)
        .sort((a, b) => b.character.level - a.character.level || b.character.exp - a.character.exp)
        .slice(0, 10)
        .map((u, index) => ({
            rank: index + 1,
            nickname: u.nickname,
            job: u.character.job,
            level: u.character.level
        }));
    res.json(top10);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`RPG Server running on port ${PORT}`));