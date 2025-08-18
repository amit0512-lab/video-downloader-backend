const express = require('express');
const cors = require('cors');
const YTDlpWrap = require('yt-dlp-wrap').default;
const axios = require('axios');
const path = require('path'); // We'll need path for the binary location

const app = express();
const port = 3000;

// Initialize yt-dlp-wrap without assuming the binary exists yet
const ytDlpWrap = new YTDlpWrap();

// --- NEW DEPLOYMENT-FRIENDLY STARTUP LOGIC ---
async function initializeAndStartServer() {
    try {
        console.log('Server starting... Checking for yt-dlp binary.');

        // Define a writable directory for the binary. Render provides '/var/data'.
        // This ensures we have a persistent place to store the executable.
        const binaryDir = path.join('/var/data', 'yt-dlp-binaries');
        const binaryPath = path.join(binaryDir, 'yt-dlp');

        // Explicitly download the latest yt-dlp binary from GitHub
        // This is the most crucial step for ensuring it works on Render.
        await YTDlpWrap.downloadFromGithub(binaryPath);

        // Tell our ytDlpWrap instance where to find the binary we just downloaded
        ytDlpWrap.setBinaryPath(binaryPath);
        
        console.log('yt-dlp binary is ready. Starting web server...');

        // Start the Express server only AFTER the binary is confirmed to be ready
        app.listen(port, () => {
            console.log(`Server is running on http://localhost:${port}`);
        });

    } catch (error) {
        console.error('Failed to initialize server:', error);
        process.exit(1); // Exit if we can't get the binary
    }
}


// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- API Endpoints (These remain the same) ---
app.post('/download-info', async (req, res) => {
    // ... your download-info endpoint logic is unchanged ...
    const videoURL = req.body.url;
    if (!videoURL) {
        return res.status(400).json({ success: false, error: 'Video URL is required.' });
    }
    console.log(`Received URL for info: ${videoURL}`);
    try {
        const metadata = await ytDlpWrap.getVideoInfo(videoURL);
        const formats = metadata.formats.filter(f => f.vcodec !== 'none' && f.acodec !== 'none' && f.ext === 'mp4');
        if (formats.length === 0) {
            return res.status(500).json({ success: false, error: 'No suitable MP4 formats found.' });
        }
        const bestFormat = formats.reduce((best, current) => (current.height > best.height ? current : best), formats[0]);
        if (!bestFormat || !bestFormat.url) {
            return res.status(500).json({ success: false, error: 'Could not find a downloadable URL.' });
        }
        const videoTitle = metadata.title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_') || 'video';
        console.log(`Found video: ${videoTitle}`);
        res.status(200).json({
            success: true,
            downloadUrl: bestFormat.url,
            title: videoTitle
        });
    } catch (error) {
        console.error('Error fetching video info:', error.message);
        res.status(500).json({ success: false, error: 'Failed to process the video link.' });
    }
});

app.get('/proxy-download', async (req, res) => {
    // ... your proxy-download endpoint logic is unchanged ...
    try {
        const videoUrl = req.query.url;
        const videoTitle = req.query.title || 'video';
        if (!videoUrl) {
            return res.status(400).send('Missing video URL');
        }
        console.log(`Proxying download for: ${videoTitle}`);
        res.setHeader('Content-Disposition', `attachment; filename="${videoTitle}.mp4"`);
        res.setHeader('Content-Type', 'video/mp4');
        const response = await axios({
            method: 'GET',
            url: videoUrl,
            responseType: 'stream'
        });
        response.data.pipe(res);
    } catch (error) {
        console.error('Proxy download error:', error.message);
        res.status(500).send('Error during video download.');
    }
});


// --- Call the function to start everything ---
initializeAndStartServer();