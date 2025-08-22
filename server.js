// paste this whole file as server.js (overwriting your old one)
const express = require('express');
const cors = require('cors');
const ytdlp = require('yt-dlp-exec');
const axios = require('axios');

const app = express();
const port = 3000;

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- API Endpoints ---
app.post('/download-info', async (req, res) => {
  try {
    const videoURL = req.body.url;
    if (!videoURL) {
      console.warn("⚠️ No video URL provided in request body.");
      return res.status(400).json({ success: false, error: 'Video URL is required.' });
    }

    console.log(`📩 Received URL for info: ${videoURL}`);

    // --- Fetch metadata ---
    console.log("⏳ Running yt-dlp to fetch metadata...");
    const metadata = await ytdlp(videoURL, {
      dumpSingleJson: true,
      noWarnings: true,
      callHome: false,
      noCheckCertificate: true,
    });

    console.log("✅ Metadata fetched successfully.");
    console.log("🔎 Available formats count:", metadata.formats ? metadata.formats.length : 0);

    // --- Pick best format ---
    let formats = (metadata.formats || []).filter(f => f.vcodec !== 'none' && f.acodec !== 'none' && f.ext === 'mp4');
    let bestFormat;

    if (formats.length > 0) {
      console.log("🎥 Found MP4 formats:", formats.map(f => `${f.height || "?"}p`).join(", "));
      bestFormat = formats.reduce((best, current) =>
        ((current.height || 0) > (best.height || 0) ? current : best), formats[0]
      );
    } else {
      console.warn("⚠️ No MP4 formats found with both audio & video. Falling back to any format with URL.");
      bestFormat = (metadata.formats || []).find(f => f.url);
    }

    if (!bestFormat || !bestFormat.url) {
      console.error("❌ No valid download URL found in formats.");
      return res.status(500).json({ success: false, error: 'No downloadable format found.' });
    }

    const videoTitle = (metadata.title || 'video')
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .replace(/\s+/g, '_');

    console.log(`🎯 Best format chosen: ${bestFormat.height || "?"}p, ext: ${bestFormat.ext}`);
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
    console.log(`🔗 Source URL (first 200 chars): ${videoUrl.slice(0, 200)}...`);

    res.setHeader('Content-Disposition', `attachment; filename="${videoTitle}.mp4"`);
    res.setHeader('Content-Type', 'video/mp4');

    const response = await axios({
      method: 'GET',
      url: videoUrl,
      responseType: 'stream',
    });

    response.data.pipe(res);

    response.data.on("end", () => {
      console.log(`✅ Finished streaming: ${videoTitle}`);
    });

    response.data.on("error", (err) => {
      console.error("❌ Stream error:", err.message);
      // If headers already sent, don't try to send another response
    });

  } catch (error) {
    console.error("❌ Proxy download error:", error && error.message ? error.message : error);
    res.status(500).send('Error during video download.');
  }
});

// --- Start the server ---
app.listen(port, () => {
  console.log(`✅ Server is running on http://localhost:${port}`);
});
