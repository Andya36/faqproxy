require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();
const faqData = require('./faq.json');

app.use(express.json());
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON format' });
  }
  next();

async function logMissedQuestionToAirtable(question, email = null) {
  const airtableToken = 'pat1lCpDX9am3MT66.5246ec5c2fcd01dfbdbc07bb4f165081a2354360e3bc9b0655a6a97cacc3289e';
  const baseId = 'appOthrYmTTWZK1Yc';
  const tableName = 'Missed Questions';
  const fields = { "Question": question };
  if (email) fields["Email"] = email;
  
  try {
    await axios.post(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`,
      { fields },
      { 
        headers: { 
          Authorization: `Bearer ${airtableToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
  } catch (err) {
    console.error('Airtable logging failed:', err.message);
  }
}


});
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

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
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
      }}
    );

    const results = embeddingResponse?.data?.data;
    if (!results || !Array.isArray(results) || results.length === 0) {
      throw new Error('No embedding returned from OpenAI.');
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
