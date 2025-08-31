const express = require('express');
const router = express.Router();
require('dotenv').config();


// Get realtime token for ElevenLabs
router.get('/realtime-token', async (req, res) => {
  try {
    // Проверяем наличие API ключа
    if (!process.env.ELEVENLABS_API_KEY) {
      console.error("ELEVENLABS_API_KEY not set in environment variables");
      return res.status(500).json({ 
        error: "ElevenLabs API key not configured",
        details: "Please set ELEVENLABS_API_KEY environment variable"
      });
    }

    console.log("Making request to ElevenLabs API...");
    console.log("API Key present:", process.env.ELEVENLABS_API_KEY ? "YES" : "NO");
    console.log("API Key length:", process.env.ELEVENLABS_API_KEY?.length || 0);

    const { default: fetch } = await import('node-fetch');
    
    const response = await fetch("https://api.elevenlabs.io/v1/realtime", {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        voice: "Rachel",
        model: "eleven_multilingual_v2",
      }),
    });

    console.log("ElevenLabs response status:", response.status);
    console.log("ElevenLabs response headers:", Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const text = await response.text();
      console.error("ElevenLabs error response:", text);
      throw new Error(`Error from ElevenLabs (${response.status}): ${text}`);
    }

    const data = await response.json();
    console.log("ElevenLabs success response:", data);
    res.status(200).json(data);
  } catch (err) {
    console.error("Realtime token fetch error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
