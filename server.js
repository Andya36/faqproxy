require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();
const faqData = require('./faq.json');

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.use(express.json());

// Error handling middleware for invalid JSON
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON format' });
  }
  next();
});

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});


async function logMissedQuestionToAirtable(question, email = null) {
  const tableName = 'Missed Questions';
  const fields = { "Question": question };
  if (email) fields["Email"] = email;

  try {
    await axios.post(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}`,
      { fields },
      {
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
  } catch (err) {
    console.error('Airtable logging failed:', err.message);
  }
}

app.get('/', (req, res) => res.json({ status: 'ok' }));

const cosineSimilarity = (a, b) => {
  const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
  const magB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
  return dot / (magA * magB);
};

app.post('/faq', async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) return res.status(400).json({ error: 'No question provided' });

    const embeddingResponse = await axios.post('https://api.openai.com/v1/embeddings',
      { input: question, model: 'text-embedding-3-small' },
      { headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
      }}
    );

    const results = embeddingResponse?.data?.data;
    if (!results || !Array.isArray(results) || results.length === 0) {
      console.warn('No embedding returned from OpenAI.');
      return res.status(500).json({ error: 'Failed to get embedding from OpenAI' });
    }
    const userEmbedding = results[0].embedding;

    const match = faqData.reduce((best, item) => {
      const score = cosineSimilarity(userEmbedding, item.embedding);
      return score > best.score ? { item, score } : best;
    }, { score: -1 });

    if (match.score >= 0.80) {
      res.json({ answer: match.item.answer });
    } else {
      await logMissedQuestionToAirtable(question);
      res.json({ answer: "We'll follow up shortly." });
    }
  } catch (err) {
    const errorDetails = {
      message: err.message,
      status: err.response?.status,
      openaiError: err.response?.data,
      timestamp: new Date().toISOString()
    };
    console.error('OpenAI API Error:', JSON.stringify(errorDetails, null, 2));
    res.status(500).json({ error: 'Failed to process request', details: errorDetails });
  }
});

app.listen(3000, '0.0.0.0', () => console.log('Server running on port 3000'));
