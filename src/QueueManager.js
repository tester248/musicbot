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
                filters: {
                    bassboost: false,
                    nightcore: false,
                    '8d': false,
                    karaoke: false,
                    vibrato: false,
                    speed: 1,
                    pitch: 1,
                },
                appliedFilterKey: null, // serialized last-applied filter state
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
                triedClients: [], // Track which YouTube clients failed
                triedNodes: [] // Track which nodes have been tried
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
            // Apply filters only when the effective filter state changed, to avoid
            // restarting the stream (and stuttering) on every track.
            await this.refreshFilters(guildId);
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

    /**
     * Build the complete Lavalink filter payload from the queue's current state
     * (volume + active audio filters).
     */
    buildFilterPayload(queue) {
        const f = queue.filters;
        const payload = {};
        if (queue.volume !== 100) payload.volume = queue.volume / 100;

        if (f.bassboost) {
            payload.equalizer = [
                { band: 0, gain: 0.18 },
                { band: 1, gain: 0.14 },
                { band: 2, gain: 0.08 },
            ];
        }

        const ts = { speed: f.speed, pitch: f.pitch, rate: 1 };
        if (f.nightcore) { ts.speed = 1.25; ts.pitch = 1.25; }
        if (ts.speed !== 1 || ts.pitch !== 1) payload.timescale = ts;

        if (f['8d']) payload.rotation = { rotationHz: 0.2 };
        if (f.karaoke) payload.karaoke = {};
        if (f.vibrato) payload.vibrato = { frequency: 10, depth: 0.4 };

        return payload;
    }

    async applyFilters(queue) {
        if (!queue.player) return;
        await queue.player.setFilters(this.buildFilterPayload(queue));
    }

    /**
     * Apply filters only if the effective filter state has changed. This avoids
     * restarting the stream (and stuttering) when nothing changed between tracks.
     */
    async refreshFilters(guildId) {
        const queue = this.getQueue(guildId);
        const key = JSON.stringify(this.buildFilterPayload(queue));
        if (queue.appliedFilterKey !== key) {
            await this.applyFilters(queue);
            queue.appliedFilterKey = key;
        }
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
