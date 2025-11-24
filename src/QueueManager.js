const { Collection } = require('discord.js');

class QueueManager {
    constructor() {
        this.queues = new Collection();
    }

    getQueue(guildId) {
        if (!this.queues.has(guildId)) {
            this.queues.set(guildId, {
                songs: [],
                currentSong: null,
                previousSong: null,
                playing: false,
                loopMode: 0, // 0: off, 1: track, 2: queue
                volume: parseInt(process.env.DEFAULT_VOLUME) || 100,
                player: null
            });
        }
        return this.queues.get(guildId);
    }

    addSongs(guildId, tracks, requester, formatDuration, originalQuery = null) {
        console.log(`[DEBUG] addSongs called with originalQuery: ${originalQuery}`);
        const queue = this.getQueue(guildId);

        for (const track of tracks) {
            queue.songs.push({
                title: track.info.title,
                url: track.info.uri,
                duration: formatDuration(track.info.length / 1000),
                thumbnail: track.info.artworkUrl || '',
                requester: requester,
                encoded: track.encoded,
                originalQuery: originalQuery || track.info.title, // For fallback
                retryCount: 0, // Track retry attempts
                triedClients: [] // Track which YouTube clients failed
            });
        }
    }

    async playNext(guildId) {
        const queue = this.getQueue(guildId);

        // Store current song as previous before changing it
        if (queue.currentSong) {
            queue.previousSong = queue.currentSong;
        }

        if (queue.loopMode === 1 && queue.currentSong) {
            // Loop track - do nothing, just replay
        } else {
            if (queue.loopMode === 2 && queue.currentSong) {
                queue.songs.push(queue.currentSong);
            }

            if (queue.songs.length === 0) {
                queue.playing = false;
                queue.currentSong = null;
                return;
            }

            queue.currentSong = queue.songs.shift();
        }

        queue.playing = true;
        const song = queue.currentSong;

        if (queue.player) {
            await queue.player.playTrack({ track: { encoded: song.encoded } });
            await queue.player.setFilters({ volume: queue.volume / 100 });
        }
    }

    clearQueue(guildId) {
        const queue = this.getQueue(guildId);
        queue.songs = [];
    }

    shuffleQueue(guildId) {
        const queue = this.getQueue(guildId);

        for (let i = queue.songs.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [queue.songs[i], queue.songs[j]] = [queue.songs[j], queue.songs[i]];
        }
    }

    setLoopMode(guildId, mode) {
        const queue = this.getQueue(guildId);

        switch (mode) {
            case 'off':
                queue.loopMode = 0;
                break;
            case 'track':
                queue.loopMode = 1;
                break;
            case 'queue':
                queue.loopMode = 2;
                break;
        }
    }

    setVolume(guildId, level) {
        const queue = this.getQueue(guildId);
        queue.volume = level;
    }
}

module.exports = QueueManager;
