const express = require('express');
const router = express.Router();

// Get realtime token for ElevenLabs
router.get('/realtime-token', async (req, res) => {
  try {
    const fetch = require('node-fetch');
    
    const response = await fetch("https://api.elevenlabs.io/v1/realtime/sessions", {
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

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Error from ElevenLabs: ${text}`);
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    console.error("Realtime token fetch error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
