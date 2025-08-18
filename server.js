const express = require('express');
const cors = require('cors');
const YTDlpWrap = require('yt-dlp-wrap').default;
const axios = require('axios'); // Import axios

const app = express();
const port = 3000;

const ytDlpWrap = new YTDlpWrap();

app.use(cors());
app.use(express.json());

// This endpoint remains the same: it just gets the video info
app.post('/download-info', async (req, res) => {
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
            downloadUrl: bestFormat.url, // The direct video URL
            title: videoTitle
        });

    } catch (error) {
        console.error('Error fetching video info:', error.message);
        res.status(500).json({ success: false, error: 'Failed to process the video link.' });
    }
});


// --- NEW PROXY ENDPOINT ---
// This endpoint will receive the direct video URL, fetch it, and stream it to the user.
app.get('/proxy-download', async (req, res) => {
    try {
        const videoUrl = req.query.url;
        const videoTitle = req.query.title || 'video';

        if (!videoUrl) {
            return res.status(400).send('Missing video URL');
        }

        console.log(`Proxying download for: ${videoTitle}`);

        // Set headers to force download
        res.setHeader('Content-Disposition', `attachment; filename="${videoTitle}.mp4"`);
        res.setHeader('Content-Type', 'video/mp4');

        // Fetch the video from the URL and stream it directly to the response
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


app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});