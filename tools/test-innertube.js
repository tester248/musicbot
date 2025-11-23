const { Innertube } = require('youtubei.js');
const fs = require('fs');
(async () => {
    try {
        const cookieFile = 'cookies.txt';
        let cookieString = undefined;
        if (fs.existsSync(cookieFile)) {
            const content = fs.readFileSync(cookieFile, 'utf8');
            try {
                const json = JSON.parse(content);
                if (Array.isArray(json)) cookieString = json.map(c => `${c.name}=${c.value}`).join('; ');
            } catch {
                // ignore
            }
        }

        const yt = await Innertube.create({ cookie: cookieString, generate_session_locally: true });
        const videoId = 'dQw4w9WgXcQ';
        const info = await yt.getBasicInfo(videoId);
        console.log('INFO KEYS:', Object.keys(info));
        const formats = info.formats || info.streaming_data?.formats || info.streamingData?.formats || [];
        console.log('formats length:', formats.length);
        console.log('First 8 formats:');
        console.dir(formats.slice(0, 8).map(f => ({ itag: f.itag, mimeType: f.mimeType, url: !!f.url, bitrate: f.bitrate || f.bitrate, type: f.type || f.container })) , { depth: null });
        console.log('streaming_data keys:', Object.keys(info.streaming_data||{}));
        console.dir(info.streaming_data, {depth:2});
    } catch (e) {
        console.error('TEST ERROR:', e);
    }
})();