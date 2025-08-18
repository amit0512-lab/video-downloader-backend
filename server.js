const express = require('express');
const cors = require('cors');
const ytdlp = require('yt-dlp-exec'); // Using the new library
const axios = require('axios');

const app = express();
const port = 3000;

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- API Endpoints ---
app.post('/download-info', (req, res) => {
    const videoURL = req.body.url;
    if (!videoURL) {
        return res.status(400).json({ success: false, error: 'Video URL is required.' });
    }
    console.log(`Received URL for info: ${videoURL}`);

    // Using yt-dlp-exec to get video metadata as a JSON object
    ytdlp(videoURL, {
        dumpSingleJson: true,
        noWarnings: true,
        callHome: false,
        noCheckCertificate: true
    })
    .then(metadata => {
        const formats = metadata.formats.filter(f => f.vcodec !== 'none' && f.acodec !== 'none' && f.ext === 'mp4');
        if (formats.length === 0) {
            // If no perfect MP4 is found, try finding any format with a URL
            const anyFormat = metadata.formats.find(f => f.url);
            if (!anyFormat) {
                return res.status(500).json({ success: false, error: 'No downloadable formats found.' });
            }
            metadata.bestFormat = anyFormat;
        } else {
             metadata.bestFormat = formats.reduce((best, current) => ((current.height || 0) > (best.height || 0) ? current : best), formats[0]);
        }
        
        if (!metadata.bestFormat || !metadata.bestFormat.url) {
            return res.status(500).json({ success: false, error: 'Could not find a downloadable URL.' });
        }

        const videoTitle = metadata.title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_') || 'video';
        console.log(`Found video: ${videoTitle}`);
        res.status(200).json({
            success: true,
            downloadUrl: metadata.bestFormat.url,
            title: videoTitle
        });
    })
    .catch(error => {
        console.error('Error fetching video info:', error.message);
        res.status(500).json({ success: false, error: 'Failed to process the video link. It may be private or invalid.' });
    });
});

app.get('/proxy-download', async (req, res) => {
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

// --- Start the server ---
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});