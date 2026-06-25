const express = require('express');
const path = require('path');
const fs = require('fs'); // ◀ [추가] 파일 읽고 쓰기를 위한 모듈

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 데이터 파일 경로 설정 (서버 폴더 내에 users.json 파일로 저장됨)
const DATA_FILE = path.join(__dirname, 'users.json');

// [함수 추가] 파일에서 유저 데이터 불러오기
function loadUsers() {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            // 파일이 없으면 빈 배열 생성
            fs.writeFileSync(DATA_FILE, JSON.stringify([]));
            return [];
        }
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error("데이터 로드 중 오류 발생:", error);
        return [];
    }
}

// [함수 추가] 파일에 유저 데이터 저장하기
function saveUsers(users) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2), 'utf8');
    } catch (error) {
        console.error("데이터 저장 중 오류 발생:", error);
    }
}

// 1. 경험치 곡선 공식 (Level 요구치 계산)
function getRequiredExp(level) {
    if (level >= 70) return Infinity;
    return Math.floor(100 * Math.pow(level, 2.5));
}

// 2. 회원가입 및 로그인 API
app.post('/api/auth/register', (req, res) => {
    const { username, password, nickname } = req.body;
    
    if (!username || !password || !nickname) {
        return res.status(400).json({ message: "모든 필드를 입력해주세요." });
    }

    const users = loadUsers(); // ◀ 파일에서 최신 데이터 불러오기
    
    if (users.find(u => u.username === username)) {
        return res.status(400).json({ message: "이미 존재하는 ID입니다." });
    }
    if (users.find(u => u.nickname === nickname)) {
        return res.status(400).json({ message: "이미 존재하는 닉네임입니다." });
    }
   
    const newUser = {
        _id: 'user_' + Date.now(), 
        username, 
        password, 
        nickname,
        character: { 
            hasCharacter: false, 
            job: '', 
            tier: 1, 
            level: 1, 
            exp: 0, 
            gold: 1000, 
            statPoints: 0, 
            stats: { speed: 10, hp: 10, atk: 10, magic: 10 }, 
            upgrades: { characterStatEff: 0 } 
        },
        inventory: { equipment: [], pets: [] },
        friends: []
    };
    
    users.push(newUser);
    saveUsers(users); // ◀ 변경된 데이터를 파일에 저장

    res.json({ success: true, message: "회원가입 완료!" });
});

app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    const users = loadUsers(); // ◀ 파일에서 최신 데이터 불러오기
    
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) return res.status(400).json({ message: "아이디 또는 비밀번호가 틀렸습니다." });
    res.json({ success: true, user });
});

// 3. 직업 선택 API
app.post('/api/char/select-job', (req, res) => {
    const { username, job } = req.body;
    const users = loadUsers();
    
    const user = users.find(u => u.username === username);
    if (!user) return res.status(404).json({ message: "유저를 찾을 수 없습니다." });
   
    user.character.job = job;
    user.character.hasCharacter = true;
    
    saveUsers(users); // ◀ 데이터 저장
    res.json({ success: true, character: user.character });
});

// 4. 전투 보상 지급 API (보스 및 레이드)
app.post('/api/battle/reward', (req, res) => {
    const { username, battleType, stageIndex, raidDifficulty } = req.body; 
    const users = loadUsers();
    
    const user = users.find(u => u.username === username);
    if (!user) return res.status(404).json({ message: "유저를 찾을 수 없습니다." });
   
    let rewardGold = 0;
    let rewardExp = 0;

    if (battleType === 'boss') {
        rewardGold = stageIndex * 50;
        rewardExp = stageIndex * 30;
    } else if (battleType === 'raid') {
        rewardGold = raidDifficulty === 'high' ? 600 : 200;
        rewardExp = raidDifficulty === 'high' ? 450 : 150;
    }

    let char = user.character;
    char.gold += rewardGold;
    char.exp += rewardExp;

    let leveledUp = false;
    while (char.level < 70 && char.exp >= getRequiredExp(char.level)) {
        char.exp -= getRequiredExp(char.level);
        char.level++;
        char.statPoints += 4;
        leveledUp = true;
       
        if (char.level >= 40 && char.tier === 1) {
            char.tier = 2;
        }
    }

    saveUsers(users); // ◀ 데이터 저장
    res.json({ success: true, rewardGold, rewardExp, character: char, leveledUp });
});

// 5. 강화 확률 계산 API (최대 5강)
app.post('/api/upgrade/try', (req, res) => {
    const { username, type, targetId } = req.body; 
    const users = loadUsers();
    
    const user = users.find(u => u.username === username);
    if (!user) return res.status(404).json({ message: "유저를 찾을 수 없습니다." });
   
    const cost = 300; 
    if (user.character.gold < cost) return res.status(400).json({ message: "골드가 부족합니다." });
    user.character.gold -= cost;

    const probability = [1.0, 0.8, 0.6, 0.4, 0.2];
   
    let currentLevel = 0;
    let itemRef = null;

    if (type === 'item') {
        itemRef = user.inventory.equipment.find(e => e.id === targetId);
        if (!itemRef) return res.status(404).json({ message: "아이템을 찾을 수 없습니다." });
        currentLevel = itemRef.upgradeLevel || 0;
    } else if (type === 'pet') {
        itemRef = user.inventory.pets.find(p => p.id === targetId);
        if (!itemRef) return res.status(404).json({ message: "펫을 찾을 수 없습니다." });
        currentLevel = itemRef.upgradeLevel || 0;
    } else {
        currentLevel = user.character.upgrades.characterStatEff;
    }

    if (currentLevel >= 5) return res.status(400).json({ message: "이미 최대 강화 단계입니다." });

    const success = Math.random() < probability[currentLevel];
    if (success) {
        if (type === 'item' || type === 'pet') {
            itemRef.upgradeLevel = currentLevel + 1;
        } else {
            user.character.upgrades.characterStatEff++;
        }
    }

    saveUsers(users); // ◀ 데이터 저장
    res.json({ success, currentLevel: success ? currentLevel + 1 : currentLevel, gold: user.character.gold });
});

// 6. 랭킹 TOP 10 조회 API
app.get('/api/ranking', (req, res) => {
    const users = loadUsers(); // ◀ 최신 파일 데이터 반영
    
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

// 7. 친구 추가 API (실제 존재 여부 검증)
app.post('/api/friends/add', (req, res) => {
    const { username, targetNickname } = req.body; 
    const users = loadUsers();

    const myUser = users.find(u => u.username === username);
    if (!myUser) return res.status(404).json({ message: "내 유저 정보를 찾을 수 없습니다." });

    const targetUser = users.find(u => u.nickname === targetNickname);
    if (!targetUser) {
        return res.status(444).json({ message: "존재하지 않는 유저 닉네임입니다." });
    }

    if (myUser.nickname === targetNickname) {
        return res.status(400).json({ message: "자기 자신은 친구로 추가할 수 없습니다." });
    }

    if (myUser.friends.includes(targetNickname)) {
        return res.status(400).json({ message: "이미 친구로 추가된 유저입니다." });
    }

    myUser.friends.push(targetNickname);
    targetUser.friends.push(myUser.nickname); 

    saveUsers(users); // ◀ 친구 목록 업데이트 저장
    res.json({ success: true, message: `${targetNickname}님과 친구가 되었습니다.`, friends: myUser.friends });
});

// 8. 친구 목록 조회 API
app.get('/api/friends/list', (req, res) => {
    const { username } = req.query;
    const users = loadUsers();
    
    const user = users.find(u => u.username === username);
    if (!user) return res.status(404).json({ message: "유저를 찾을 수 없습니다." });

    res.json({ success: true, friends: user.friends });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`RPG Server running on port ${PORT}`));