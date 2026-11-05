const { EmbedBuilder } = require('discord.js');

class MusicPlayer {
    constructor(spotify, shoukaku) {
        this.spotify = spotify;
        this.shoukaku = shoukaku;
    }

    async searchTrack(node, query, isUrl) {
        // Direct URL: pass straight through (URLs already target a specific source).
        if (isUrl) {
            try {
                const result = await node.rest.resolve(query);
                return this.isUsable(result) ? result : null;
            } catch {
                return null;
            }
        }

        // Search fallback chain (YouTube remains primary):
        //   YouTube → YouTube Music → Spotify→YouTube → SoundCloud → Bandcamp
        for (const prefix of ['ytsearch', 'ytmsearch']) {
            const result = await this.tryResolve(node, prefix, query);
            if (result) {
                console.log(`✅ Found via ${prefix}`);
                return result;
            }
        }

        const spotifyResult = await this.trySpotifyFallback(node, query);
        if (spotifyResult) return spotifyResult;

        for (const prefix of ['scsearch', 'bcsearch']) {
            const result = await this.tryResolve(node, prefix, query);
            if (result) {
                console.log(`✅ Found via ${prefix}`);
                return result;
            }
        }

        return null;
    }

    isUsable(result) {
        return !!result && result.loadType !== 'empty' && result.loadType !== 'error';
    }

    async tryResolve(node, prefix, query) {
        try {
            const result = await node.rest.resolve(`${prefix}:${query}`);
            if (this.isUsable(result)) return result;
        } catch {}
        return null;
    }

    async trySpotifyFallback(node, query) {
        try {
            const sp = await this.spotify.searchTracks(query, { limit: 1 });
            const track = sp?.body?.tracks?.items?.[0];
            if (!track || !track.artists || !track.artists[0]) return null;
            const q = `${track.name} ${track.artists[0].name}`;
            const result = await this.tryResolve(node, 'ytsearch', q);
            if (result) console.log('✅ Found via Spotify→YouTube');
            return result;
        } catch {
            return null;
        }
    }

    parseSearchResult(result) {
        if (!result || result.loadType === 'empty') {
            return { tracks: [], playlistName: null, error: 'No results found on YouTube, Spotify, or SoundCloud!' };
        }

        let tracks = [];
        let playlistName = null;

        if (result.loadType === 'playlist') {
            tracks = result.data.tracks;
            playlistName = result.data.info.name;
        } else if (result.loadType === 'track') {
            tracks = [result.data];
        } else if (result.loadType === 'search') {
            tracks = result.data && result.data.length > 0 ? [result.data[0]] : [];
        } else if (result.loadType === 'error') {
            console.error('Lavalink error:', result.data);
            return { tracks: [], playlistName: null, error: result.data.message || 'Failed to load track' };
        } else {
            console.error('Unknown loadType:', result.loadType);
            tracks = Array.isArray(result.data) ? result.data : [result.data];
        }

        return { tracks, playlistName, error: null };
    }

    async handleSpotifyUrl(query) {
        try {
            const url = new URL(query);
            const pathParts = url.pathname.split('/');
            let id = pathParts[pathParts.length - 1];
            let type = pathParts[pathParts.length - 2];

            if (id.includes('?')) id = id.split('?')[0];

            if (type === 'track') {
                const data = await this.spotify.getTrack(id);
                const track = data.body;
                return { query: `${track.name} ${track.artists[0].name}`, isUrl: false, playlistName: null };
            } else if (type === 'playlist') {
                const data = await this.spotify.getPlaylist(id);
                const playlist = data.body;

                // Fetch the whole playlist (paginated), capped for safety.
                const MAX_PLAYLIST = 25;
                const out = [];

                const pushItems = (list) => {
                    for (const item of list) {
                        if (item && item.track && item.track.name) {
                            out.push({
                                name: item.track.name,
                                artist: (item.track.artists[0] && item.track.artists[0].name) || 'Unknown'
                            });
                            if (out.length >= MAX_PLAYLIST) return true;
                        }
                    }
                    return false;
                };

                pushItems(playlist.tracks.items);
                let offset = playlist.tracks.items.length;
                const total = playlist.tracks.total || offset;

                while (out.length < MAX_PLAYLIST && total > offset) {
                    const more = await this.spotify.getPlaylistTracks(id, { offset, limit: 50 });
                    if (!more.body.items.length) break;
                    if (pushItems(more.body.items)) break;
                    offset += more.body.items.length;
                }

                if (!out.length) return { error: 'Playlist is empty!' };
                return { isPlaylist: true, playlistName: playlist.name, playlistTracks: out };
            }
        } catch (error) {
            console.error('Spotify error:', error);
        }
        return { query, isUrl: true, playlistName: null };
    }

    formatDuration(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    createQueueEmbed(tracks, playlistName, song) {
        const embed = new EmbedBuilder().setColor('#00ff00');

        if (playlistName) {
            embed.setTitle(`🎵 Added Playlist: ${playlistName}`)
                .setDescription(`Added **${tracks.length}** songs to queue.`);
        } else if (song) {
            embed.setTitle('🎵 Added to Queue')
                .setDescription(`**${song.title}**`)
                .addFields(
                    { name: 'Duration', value: song.duration, inline: true },
                    { name: 'Requested by', value: song.requester.toString(), inline: true }
                );
        } else {
            embed.setTitle('🎵 Added to Queue')
                .setDescription(`Added **${tracks.length}** song(s) to queue.`);
        }

        return { embeds: [embed] };
    }
}

module.exports = MusicPlayer;
