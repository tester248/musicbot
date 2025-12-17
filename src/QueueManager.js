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

    removeSong(guildId, position) {
        const queue = this.getQueue(guildId);
        
        // position is 1-indexed for users, convert to 0-indexed
        const index = position - 1;
        
        if (index < 0 || index >= queue.songs.length) {
            return { success: false, error: 'Invalid position!' };
        }
        
        const removedSong = queue.songs.splice(index, 1)[0];
        return { success: true, song: removedSong };
    }

    moveSong(guildId, fromPosition, toPosition) {
        const queue = this.getQueue(guildId);
        
        // positions are 1-indexed for users, convert to 0-indexed
        const fromIndex = fromPosition - 1;
        const toIndex = toPosition - 1;
        
        if (fromIndex < 0 || fromIndex >= queue.songs.length) {
            return { success: false, error: 'Invalid source position!' };
        }
        
        if (toIndex < 0 || toIndex >= queue.songs.length) {
            return { success: false, error: 'Invalid target position!' };
        }
        
        const [song] = queue.songs.splice(fromIndex, 1);
        queue.songs.splice(toIndex, 0, song);
        
        return { success: true, song: song };
    }
}

module.exports = QueueManager;
