require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Basic health check
app.get('/', (req, res) => {
  res.json({ status: 'ok' });
});

const faqData = require('./faq.json');

// Cosine similarity between two vectors
function cosineSimilarity(a, b) {
    const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
    const magA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
    const magB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
    return dot / (magA * magB);
}

app.post('/faq', async (req, res) => {
    const userQuestion = req.body.question;

    if (!userQuestion) return res.status(400).json({ error: 'No question provided' });

    try {
        const embeddingResponse = await axios.post(
            'https://api.openai.com/v1/embeddings',
            {
                input: userQuestion,
                model: 'text-embedding-3-small'
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const userEmbedding = embeddingResponse.data.data[0].embedding;

        let bestMatch = null;
        let bestScore = -1;

        faqData.forEach(item => {
            const score = cosineSimilarity(userEmbedding, item.embedding);
            if (score > bestScore) {
                bestScore = score;
                bestMatch = item;
            }
        });

        if (bestScore >= 0.80) {
            res.json({ answer: bestMatch.answer });
        } else {
            res.json({ answer: "We’ll follow up with more information shortly." });
        }

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Failed to process request' });
    }
});

// Use Render’s dynamic port
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
