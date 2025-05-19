require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const faqData = require('./faq.json');

// Cosine similarity function
function cosineSimilarity(a, b) {
  const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
  const magB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
  return dot / (magA * magB);
}

// Logs missed question to Airtable
async function logMissedQuestionToAirtable(question, email = '') {
  try {
    await axios.post(
      'https://api.airtable.com/v0/appOthrYmTTWZK1Yc/Imported%20table',
      {
        fields: {
          Question: question,
          Email: email
        }
      },
      {
        headers: {
          Authorization: `Bearer patllCpDX9am3MT66.5246ec5c2fcd01dfbdbc07bb4f165081a2354360e3bc9b0655a6a97cacc3289e`,
          'Content-Type': 'application/json'
        }
      }
    );
  } catch (err) {
    console.error('Airtable logging failed:', err.message);
  }
}

app.post('/faq', async (req, res) => {
  const userQuestion = req.body.question;
  const userEmail = req.body.email || '';

  if (!userQuestion) {
    return res.status(400).json({ error: 'No question provided' });
  }

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
      await logMissedQuestionToAirtable(userQuestion, userEmail);
      res.json({ answer: "We’ll follow up shortly." });
    }
  } catch (err) {
    console.error('OpenAI API Error:', err.message);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
