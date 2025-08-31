const express = require('express');
const router = express.Router();
require('dotenv').config();

// Get realtime connection info for ElevenLabs
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

    console.log("Preparing realtime connection info...");
    console.log("API Key present:", process.env.ELEVENLABS_API_KEY ? "YES" : "NO");
    console.log("API Key length:", process.env.ELEVENLABS_API_KEY?.length || 0);

    // Возвращаем данные для WebSocket подключения
    const realtimeData = {
      websocket_url: "wss://api.elevenlabs.io/v1/text-to-speech/stream",
      api_key: process.env.ELEVENLABS_API_KEY,
      voice_id: "Rachel", // или любой другой voice ID
      model_id: "eleven_multilingual_v2",
      // Альтернативный формат для совместимости
      client_secret: {
        value: process.env.ELEVENLABS_API_KEY
      }
    };

    console.log("Realtime connection data prepared successfully");
    res.status(200).json(realtimeData);
  } catch (err) {
    console.error("Realtime connection preparation error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

