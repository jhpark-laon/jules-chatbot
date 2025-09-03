// .env 파일에서 환경 변수를 로드합니다.
require('dotenv').config();

const express = require('express');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// 정적 파일(HTML, CSS, JS)을 제공하기 위한 미들웨어 설정
app.use(express.static(path.join(__dirname, '')));

// JSON 요청 본문을 파싱하기 위한 미들웨어 설정
app.use(express.json());

// 기본 라우트 - 웹사이트 접속 시 index.html을 제공
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Chat API 엔드포인트
app.post('/chat', async (req, res) => {
    const userMessage = req.body.message;
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey || apiKey === "YOUR_API_KEY_HERE") {
        return res.json({ reply: "안녕하세요! AI 챗봇입니다. 지금은 관리자가 API 키를 설정해야 대화할 수 있어요." });
    }

    const systemPrompt = `
        You are a friendly and enthusiastic AI assistant.
        Your persona is a junior developer who is passionate about new AI technologies.
        You love discussing AI tools and sharing what you're learning.
        You should proactively engage the user, ask questions, and share interesting new AI facts or tools you've "discovered".
        Your language is Korean.
    `;

    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-3.5-turbo',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage }
            ],
            temperature: 0.7,
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            }
        });

        const botResponse = response.data.choices[0].message.content;
        res.json({ reply: botResponse });

    } catch (error) {
        console.error('OpenAI API error:', error.response ? error.response.data : error.message);
        res.status(500).json({ reply: "AI와 대화하는 중 에러가 발생했어요. 잠시 후 다시 시도해주세요." });
    }
});

// 서버 시작
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
