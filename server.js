const express = require('express');
const cors = require('cors');
const ytdlp = require('yt-dlp-exec');
const axios = require('axios');

const app = express();

// Use Render's PORT or default to 3000 for local dev
const port = process.env.PORT || 3000;

// --- Middleware ---
// Option 1: open CORS (simple)
// app.use(cors());

// Option 2: restrict to your Netlify domain(s)
app.use(cors({
  origin: [
    'https://video-downloader-frontend.netlify.app',
    /\.netlify\.app$/  // allows preview deploys too
  ],
  methods: ['GET', 'POST'],
  credentials: false
}));

app.use(express.json());

// --- Health & root endpoints (for UptimeRobot & sanity checks) ---
app.get('/', (req, res) => {
  res.status(200).send('OK');
});

app.get('/health', (req, res) => {
  res.status(200).json({ ok: true, uptime: process.uptime(), ts: new Date().toISOString() });
});

// --- API Endpoints ---
app.post('/download-info', async (req, res) => {
  try {
    const videoURL = req.body.url;
    if (!videoURL) {
      console.warn("⚠️ No video URL provided in request body.");
      return res.status(400).json({ success: false, error: 'Video URL is required.' });
    }

    console.log(`📩 Received URL for info: ${videoURL}`);
    console.log("⏳ Running yt-dlp to fetch metadata...");

    const metadata = await ytdlp(videoURL, {
      dumpSingleJson: true,
      noWarnings: true,
      callHome: false,
      noCheckCertificate: true,
    });

    console.log("✅ Metadata fetched successfully.");
    console.log("🔎 Available formats count:", metadata.formats ? metadata.formats.length : 0);

    let formats = (metadata.formats || []).filter(f => f.vcodec !== 'none' && f.acodec !== 'none' && f.ext === 'mp4');
    let bestFormat;

    if (formats.length > 0) {
      console.log("🎥 Found MP4 formats:", formats.map(f => `${f.height || "?"}p`).join(", "));
      bestFormat = formats.reduce((best, current) =>
        ((current.height || 0) > (best.height || 0) ? current : best), formats[0]
      );
    } else {
      console.warn("⚠️ No MP4 with both audio & video. Falling back to any format with URL.");
      bestFormat = (metadata.formats || []).find(f => f.url);
    }

    if (!bestFormat || !bestFormat.url) {
      console.error("❌ No valid download URL found in formats.");
      return res.status(500).json({ success: false, error: 'No downloadable format found.' });
    }

    const videoTitle = (metadata.title || 'video')
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .replace(/\s+/g, '_');

    console.log(`🎯 Best format: ${bestFormat.height || "?"}p, ext: ${bestFormat.ext}`);
    console.log(`📌 Video title: ${videoTitle}`);

    res.json({
      success: true,
      downloadUrl: bestFormat.url,
      title: videoTitle,
    });

  } catch (error) {
    console.error("❌ Error in /download-info:", error && error.message ? error.message : error);
    if (error && error.stderr) console.error("yt-dlp stderr:", error.stderr);
    res.status(500).json({
      success: false,
      error: 'Failed to process the video link. It may be private, unsupported, or invalid.',
      details: error && error.message ? error.message : String(error),
    });
  }
});

app.get('/proxy-download', async (req, res) => {
  try {
    const videoUrl = req.query.url;
    const videoTitle = req.query.title || 'video';
    if (!videoUrl) {
      console.warn("⚠️ Missing video URL in proxy request.");
      return res.status(400).send('Missing video URL');
    }

    console.log(`🚀 Proxying download for: ${videoTitle}`);
    console.log(`🔗 Source URL (first 200 chars): ${String(videoUrl).slice(0, 200)}...`);

    res.setHeader('Content-Disposition', `attachment; filename="${videoTitle}.mp4"`);
    res.setHeader('Content-Type', 'video/mp4');

    const response = await axios({
      method: 'GET',
      url: videoUrl,
      responseType: 'stream',
      // timeout: 0 // (default no timeout) keep streaming large files
    });

    response.data.pipe(res);

    response.data.on("end", () => {
      console.log(`✅ Finished streaming: ${videoTitle}`);
    });

    response.data.on("error", (err) => {
      console.error("❌ Stream error:", err.message);
    });

  } catch (error) {
    console.error("❌ Proxy download error:", error && error.message ? error.message : error);
    res.status(500).send('Error during video download.');
  }
});

// --- Start the server ---
app.listen(port, () => {
  console.log(`✅ Server is running on port ${port}`);
});
