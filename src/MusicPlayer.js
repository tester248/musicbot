const { EmbedBuilder } = require('discord.js');

class MusicPlayer {
    constructor(spotify, shoukaku) {
        this.spotify = spotify;
        this.shoukaku = shoukaku;
    }

    async searchTrack(node, query, isUrl) {
        const searchType = isUrl ? '' : (query.startsWith('scsearch:') ? '' : 'ytsearch:');
        let result = await node.rest.resolve(isUrl ? query : `${searchType}${query}`);

        // Fallback mechanism: YouTube → Spotify → SoundCloud
        if (!result || result.loadType === 'empty' || result.loadType === 'error') {
            console.log(`❌ YouTube search failed for "${query}", trying Spotify...`);

            // Try Spotify search as fallback
            try {
                const spotifyResults = await this.spotify.searchTracks(query, { limit: 1 });
                if (spotifyResults.body.tracks.items.length > 0) {
                    const track = spotifyResults.body.tracks.items[0];
                    const spotifyQuery = `${track.name} ${track.artists[0].name}`;
                    result = await node.rest.resolve(`ytsearch:${spotifyQuery}`);
                    console.log(`✅ Found via Spotify: ${spotifyQuery}`);
                }
            } catch (spotifyError) {
                console.error('Spotify fallback failed:', spotifyError);
            }
        }

        // If still no results, try SoundCloud
        if (!result || result.loadType === 'empty' || result.loadType === 'error') {
            console.log(`❌ Spotify fallback failed for "${query}", trying SoundCloud...`);
            result = await node.rest.resolve(`scsearch:${query}`);
            if (result && result.loadType !== 'empty' && result.loadType !== 'error') {
                console.log(`✅ Found via SoundCloud`);
            }
        }

        return result;
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

                if (playlist.tracks.items.length > 0) {
                    const item = playlist.tracks.items[0];
                    if (item.track) {
                        return {
                            query: `${item.track.name} ${item.track.artists[0].name}`,
                            isUrl: false,
                            playlistName: playlist.name
                        };
                    }
                }
                return { query: null, isUrl: false, playlistName: null, error: 'Playlist is empty!' };
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
