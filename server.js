// .env 파일에서 환경 변수를 로드합니다.
require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3034;

let vectorStore = []; // Renamed for clarity

// Simple text chunking
function chunkText(text) {
    const paragraphs = text.split(/\n\s*\n/);
    return paragraphs.filter(p => p.trim() !== '');
}

// Calculate cosine similarity between two vectors
function cosineSimilarity(vecA, vecB) {
    let dotProduct = 0.0;
    let normA = 0.0;
    let normB = 0.0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) {
        return 0;
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Function to get embedding for a single text chunk
async function getEmbedding(text, apiKey) {
    try {
        const response = await axios.post('https://api.openai.com/v1/embeddings', {
            model: 'text-embedding-3-small',
            input: text,
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            }
        });
        return response.data.data[0].embedding;
    } catch (error) {
        console.error(`Failed to get embedding for text: "${text.substring(0, 50)}..."`, error.response ? error.response.data : error.message);
        return null;
    }
}

// Find the most relevant chunks from the vector store
function findMostRelevantChunks(queryEmbedding, topN = 3) {
    if (!vectorStore || vectorStore.length === 0) {
        return [];
    }

    const similarities = vectorStore.map(item => ({
        text: item.text,
        similarity: cosineSimilarity(queryEmbedding, item.embedding),
    }));

    similarities.sort((a, b) => b.similarity - a.similarity);

    // Filter out chunks with low similarity to avoid irrelevant context
    const threshold = 0.7;
    const relevantChunks = similarities.slice(0, topN).filter(item => item.similarity > threshold);

    return relevantChunks.map(item => item.text);
}

// Load, chunk, and embed documents
async function loadKnowledgeBase() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey === "YOUR_API_KEY_HERE") {
        console.log("OpenAI API key not found. Skipping knowledge base loading.");
        return;
    }

    const knowledgeDir = path.join(__dirname, 'knowledge');
    try {
        const files = fs.readdirSync(knowledgeDir);
        const txtFiles = files.filter(file => file.endsWith('.txt'));
        console.log(`Found ${txtFiles.length} text file(s) in 'knowledge' directory.`);

        let newVectorStore = [];
        for (const file of txtFiles) {
            const filePath = path.join(knowledgeDir, file);
            const content = fs.readFileSync(filePath, 'utf-8');
            const chunks = chunkText(content);

            for (const chunk of chunks) {
                const embedding = await getEmbedding(chunk, apiKey);
                if (embedding) {
                    newVectorStore.push({ text: chunk, embedding: embedding });
                }
                // Add a small delay to avoid hitting rate limits on very large document sets
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }
        vectorStore = newVectorStore;
        console.log(`Knowledge base loaded and embedded. Total vectors: ${vectorStore.length}`);
    } catch (error) {
        console.error('Failed to load knowledge base:', error);
        if (error.code === 'ENOENT') {
            console.log("Creating 'knowledge' directory. Please add your .txt files there.");
            fs.mkdirSync(knowledgeDir, { recursive: true });
        }
    }
}

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

    if (vectorStore.length === 0) {
        return res.json({ reply: "음, 그 질문에 대해서는 제가 아직 아는 정보가 부족하네요. 더 많은 것을 배워서 답변해 드릴 수 있도록 노력할게요! 혹시 다른 질문이 있으신가요?" });
    }

    try {
        // 1. Get embedding for the user's question
        const queryEmbedding = await getEmbedding(userMessage, apiKey);
        if (!queryEmbedding) {
            return res.status(500).json({ reply: "질문을 이해하는 중 오류가 발생했습니다." });
        }

        // 2. Find relevant context from the vector store
        const relevantContext = findMostRelevantChunks(queryEmbedding);

        // 3. Construct the RAG prompt
        let systemPrompt;
        if (relevantContext.length > 0) {
            const contextString = relevantContext.join("\n---\n");
            systemPrompt = `
                당신은 특정 회사 제품에 대한 전문가입니다.
                주어진 '컨텍스트' 정보만을 사용하여 사용자의 질문에 답변해야 합니다.
                답변은 반드시 한국어로 해야 합니다.
                만약 컨텍스트에 질문에 대한 답변이 명확하게 나와있지 않다면, 추측하지 말고 반드시 "해당 정보는 제가 아는 내용과 관련이 없어 잘 모르겠습니다."라고만 답변해야 합니다.

                컨텍스트:
                ---
                ${contextString}
                ---
            `;
        } else {
            // If no relevant context is found, we can directly answer without calling the AI,
            // or call the AI with a prompt that guarantees the desired "I don't know" response.
            // For consistency, we'll let the AI handle it.
            systemPrompt = `
                당신은 특정 회사 제품에 대한 전문가입니다.
                사용자가 질문했지만, 관련된 정보가 지식 베이스에 전혀 없습니다.
                반드시 "해당 정보는 제가 아는 내용과 관련이 없어 잘 모르겠습니다."라고만 답변해야 합니다.
            `;
        }

        // 4. Call the Chat Completion API with the new prompt
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4-turbo', // Using a more powerful model for better instruction following
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage }
            ],
            temperature: 0.2, // Lower temperature for more factual, less creative answers
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
(async () => {
    await loadKnowledgeBase();
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
})();
