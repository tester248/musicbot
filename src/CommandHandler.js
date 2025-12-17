const { EmbedBuilder } = require('discord.js');

class CommandHandler {
    constructor(queueManager, musicPlayer, shoukaku, spotify, geniusClient) {
        this.queueManager = queueManager;
        this.musicPlayer = musicPlayer;
        this.shoukaku = shoukaku;
        this.spotify = spotify;
        this.geniusClient = geniusClient;
    }

    async handlePlay(interaction, query) {
        const isSlash = interaction.isChatInputCommand?.() ?? false;
        const member = interaction.member;
        const guild = interaction.guild;

        if (!member.voice.channel) {
            const reply = '❌ You need to be in a voice channel to play music!';
            return isSlash ? interaction.reply({ content: reply, ephemeral: true }) : interaction.reply(reply);
        }

        if (!query) {
            const reply = '❌ Please provide a song name or URL!';
            return isSlash ? interaction.reply({ content: reply, ephemeral: true }) : interaction.reply(reply);
        }

        if (isSlash) await interaction.deferReply();

        const node = this.shoukaku.options.nodeResolver(this.shoukaku.nodes);
        if (!node) {
            const reply = '❌ No Lavalink node available!';
            return isSlash ? interaction.editReply(reply) : interaction.reply(reply);
        }

        let tracks = [];
        let playlistName = null;
        let isUrl = query.startsWith('http');

        // Spotify handling
        if (query.includes('spotify.com')) {
            const spotifyResult = await this.musicPlayer.handleSpotifyUrl(query);
            if (spotifyResult.error) {
                return isSlash ? interaction.editReply(spotifyResult.error) : interaction.reply(spotifyResult.error);
            }
            query = spotifyResult.query;
            isUrl = spotifyResult.isUrl;
            playlistName = spotifyResult.playlistName;
        }

        try {
            const result = await this.musicPlayer.searchTrack(node, query, isUrl);
            const parsed = this.musicPlayer.parseSearchResult(result);

            if (parsed.error) {
                const reply = `❌ ${parsed.error}`;
                return isSlash ? interaction.editReply(reply) : interaction.reply(reply);
            }

            tracks = parsed.tracks;
            if (parsed.playlistName) playlistName = parsed.playlistName;
        } catch (err) {
            console.error('Lavalink resolve error:', err);
            const reply = '❌ Error searching for song!';
            return isSlash ? interaction.editReply(reply) : interaction.reply(reply);
        }

        if (!tracks || tracks.length === 0) {
            const reply = '❌ No tracks found!';
            return isSlash ? interaction.editReply(reply) : interaction.reply(reply);
        }

        const queue = this.queueManager.getQueue(guild.id);

        if (!queue.player) {
            try {
                const player = await this.shoukaku.joinVoiceChannel({
                    guildId: guild.id,
                    channelId: member.voice.channel.id,
                    shardId: 0
                });

                player.on('start', () => {
                    console.log('Track started');
                    const queue = this.queueManager.getQueue(guild.id);
                    if (queue.currentSong && queue.textChannel) {
                        const embed = new EmbedBuilder()
                            .setColor('#0099ff')
                            .setTitle('🎶 Now Playing')
                            .setDescription(`**${queue.currentSong.title}**`)
                            .addFields(
                                { name: 'Duration', value: queue.currentSong.duration, inline: true },
                                { name: 'Requested by', value: queue.currentSong.requester.toString(), inline: true }
                            );
                        if (queue.currentSong.thumbnail) {
                            embed.setThumbnail(queue.currentSong.thumbnail);
                        }
                        queue.textChannel.send({ embeds: [embed] }).catch(console.error);
                    }
                });
                player.on('end', () => this.queueManager.playNext(guild.id));
                player.on('exception', async (err) => {
                    console.error('Track exception:', err);

                    const queue = this.queueManager.getQueue(guild.id);
                    // Try to get failed song from current or previous (if playNext already ran)
                    let failedSong = queue.currentSong || queue.previousSong;

                    console.log('[DEBUG] Exception handler - failedSong:', failedSong ? failedSong.title : 'null');

                    // Check if we should retry with YouTube (max 4 attempts)
                    if (failedSong && failedSong.retryCount < 4) {
                        console.log(`🔄 YouTube playback failed (attempt ${failedSong.retryCount + 1}/4), re-resolving...`);

                        try {
                            // Re-resolve the track to get a fresh URL/client
                            const searchType = failedSong.originalQuery.startsWith('http') ? '' : 'ytsearch:';
                            const result = await node.rest.resolve(failedSong.originalQuery.startsWith('http') ? failedSong.originalQuery : `${searchType}${failedSong.originalQuery}`);

                            if (result && result.data && (Array.isArray(result.data) ? result.data.length > 0 : result.data)) {
                                const newTrack = Array.isArray(result.data) ? result.data[0] : result.data;
                                failedSong.encoded = newTrack.encoded; // Update with new encoded string
                                failedSong.retryCount++;

                                // Re-add to front of queue
                                queue.songs.unshift(failedSong);

                                // Force playNext to take from queue (bypass loop mode for retry)
                                queue.currentSong = null;
                                queue.playing = false;

                                await this.queueManager.playNext(guild.id);
                                return;
                            }
                        } catch (resolveErr) {
                            console.error('Re-resolve failed:', resolveErr);
                        }
                    }

                    // If we get here, retry failed or max retries reached
                    if (failedSong && failedSong.originalQuery) {
                        console.log(`❌ All YouTube clients failed for "${failedSong.title}", trying fallback...`);
                        await this.handlePlaybackFallback(guild.id, failedSong.originalQuery, failedSong.requester);
                    } else {
                        // No retry possible, skip to next
                        await this.queueManager.playNext(guild.id);
                    }
                });

                queue.player = player;
            } catch (e) {
                console.error('Failed to join voice:', e);
                const reply = '❌ Failed to join voice channel!';
                return isSlash ? interaction.editReply(reply) : interaction.reply(reply);
            }
        }

        queue.textChannel = interaction.channel;
        this.queueManager.addSongs(guild.id, tracks, member.user, this.musicPlayer.formatDuration.bind(this.musicPlayer), query);

        if (!queue.playing) {
            this.queueManager.playNext(guild.id);
        }

        const song = queue.songs[queue.songs.length - tracks.length];
        const reply = this.musicPlayer.createQueueEmbed(tracks, playlistName, song);
        isSlash ? interaction.editReply(reply) : interaction.reply(reply);
    }

    async handleSkip(interaction) {
        const isSlash = interaction.isChatInputCommand?.() ?? false;
        const queue = this.queueManager.getQueue(interaction.guild.id);

        if (!queue.player) {
            const reply = '❌ Nothing is playing!';
            return isSlash ? interaction.reply({ content: reply, ephemeral: true }) : interaction.reply(reply);
        }

        queue.player.stopTrack();
        const reply = '⏭️ Skipped!';
        isSlash ? interaction.reply(reply) : interaction.reply(reply);
    }

    async handleStop(interaction) {
        const isSlash = interaction.isChatInputCommand?.() ?? false;
        const queue = this.queueManager.getQueue(interaction.guild.id);

        if (queue.player) {
            this.queueManager.clearQueue(interaction.guild.id);
            queue.playing = false;
            queue.currentSong = null;
            queue.player.stopTrack();
        }

        const reply = '⏹️ Stopped and cleared queue!';
        isSlash ? interaction.reply(reply) : interaction.reply(reply);
    }

    async handlePause(interaction) {
        const isSlash = interaction.isChatInputCommand?.() ?? false;
        const queue = this.queueManager.getQueue(interaction.guild.id);

        if (queue.player) {
            queue.player.setPaused(true);
            const reply = '⏸️ Paused!';
            isSlash ? interaction.reply(reply) : interaction.reply(reply);
        } else {
            const reply = '❌ Nothing is playing!';
            isSlash ? interaction.reply({ content: reply, ephemeral: true }) : interaction.reply(reply);
        }
    }

    async handleResume(interaction) {
        const isSlash = interaction.isChatInputCommand?.() ?? false;
        const queue = this.queueManager.getQueue(interaction.guild.id);

        if (queue.player) {
            queue.player.setPaused(false);
            const reply = '▶️ Resumed!';
            isSlash ? interaction.reply(reply) : interaction.reply(reply);
        } else {
            const reply = '❌ Nothing is playing!';
            isSlash ? interaction.reply({ content: reply, ephemeral: true }) : interaction.reply(reply);
        }
    }

    async handleQueue(interaction, subcommand = null, ...args) {
        const isSlash = interaction.isChatInputCommand?.() ?? false;
        const queue = this.queueManager.getQueue(interaction.guild.id);

        // Handle subcommands
        if (subcommand === 'remove') {
            return this.handleQueueRemove(interaction, args[0]);
        } else if (subcommand === 'move') {
            return this.handleQueueMove(interaction, args[0], args[1]);
        }

        // Default queue display with pagination
        const page = args[0] || 1;
        
        if (!queue.currentSong && queue.songs.length === 0) {
            const reply = '❌ Queue is empty!';
            return isSlash ? interaction.reply({ content: reply, ephemeral: true }) : interaction.reply(reply);
        }

        const songsPerPage = 10;
        const totalPages = Math.ceil(queue.songs.length / songsPerPage);
        const currentPage = Math.max(1, Math.min(page, totalPages || 1));
        const startIndex = (currentPage - 1) * songsPerPage;
        const endIndex = startIndex + songsPerPage;

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('🎶 Music Queue');

        if (queue.currentSong) {
            embed.addFields({ name: 'Now Playing', value: `**${queue.currentSong.title}** | Requested by: ${queue.currentSong.requester}` });
        }

        if (queue.songs.length > 0) {
            const queueList = queue.songs.slice(startIndex, endIndex).map((song, index) => {
                return `${startIndex + index + 1}. **${song.title}** (${song.duration})`;
            }).join('\n');

            embed.setDescription(`**Up Next:**\n${queueList}`);
            
            if (totalPages > 1) {
                embed.setFooter({ text: `Page ${currentPage}/${totalPages} | Total songs: ${queue.songs.length}` });
            }
        } else {
            embed.setDescription('No more songs in queue.');
        }

        const reply = { embeds: [embed] };
        isSlash ? interaction.reply(reply) : interaction.reply(reply);
    }

    async handleQueueRemove(interaction, position) {
        const isSlash = interaction.isChatInputCommand?.() ?? false;
        
        if (!position || isNaN(position)) {
            const reply = '❌ Please provide a valid position number!';
            return isSlash ? interaction.reply({ content: reply, ephemeral: true }) : interaction.reply(reply);
        }

        const result = this.queueManager.removeSong(interaction.guild.id, parseInt(position));
        
        if (!result.success) {
            const reply = `❌ ${result.error}`;
            return isSlash ? interaction.reply({ content: reply, ephemeral: true }) : interaction.reply(reply);
        }

        const reply = `✅ Removed from queue: **${result.song.title}**`;
        isSlash ? interaction.reply(reply) : interaction.reply(reply);
    }

    async handleQueueMove(interaction, fromPosition, toPosition) {
        const isSlash = interaction.isChatInputCommand?.() ?? false;
        
        if (!fromPosition || !toPosition || isNaN(fromPosition) || isNaN(toPosition)) {
            const reply = '❌ Please provide valid position numbers!';
            return isSlash ? interaction.reply({ content: reply, ephemeral: true }) : interaction.reply(reply);
        }

        const result = this.queueManager.moveSong(interaction.guild.id, parseInt(fromPosition), parseInt(toPosition));
        
        if (!result.success) {
            const reply = `❌ ${result.error}`;
            return isSlash ? interaction.reply({ content: reply, ephemeral: true }) : interaction.reply(reply);
        }

        const reply = `✅ Moved **${result.song.title}** from position ${fromPosition} to position ${toPosition}`;
        isSlash ? interaction.reply(reply) : interaction.reply(reply);
    }

    async handleNowPlaying(interaction) {
        const isSlash = interaction.isChatInputCommand?.() ?? false;
        const queue = this.queueManager.getQueue(interaction.guild.id);

        if (!queue.currentSong) {
            const reply = '❌ Nothing is playing!';
            return isSlash ? interaction.reply({ content: reply, ephemeral: true }) : interaction.reply(reply);
        }

        const song = queue.currentSong;
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('🎶 Now Playing')
            .setDescription(`**${song.title}**`)
            .addFields(
                { name: 'Duration', value: song.duration, inline: true },
                { name: 'Requested by', value: song.requester.toString(), inline: true }
            );

        if (song.thumbnail) {
            embed.setThumbnail(song.thumbnail);
        }

        const reply = { embeds: [embed] };
        isSlash ? interaction.reply(reply) : interaction.reply(reply);
    }

    async handleVolume(interaction, level) {
        const isSlash = interaction.isChatInputCommand?.() ?? false;
        const queue = this.queueManager.getQueue(interaction.guild.id);

        if (level < 0 || level > 100) {
            const reply = '❌ Volume must be between 0 and 100!';
            return isSlash ? interaction.reply({ content: reply, ephemeral: true }) : interaction.reply(reply);
        }

        this.queueManager.setVolume(interaction.guild.id, level);
        if (queue.player) {
            await queue.player.setFilters({ volume: level / 100 });
        }

        const reply = `🔊 Volume set to ${level}%`;
        isSlash ? interaction.reply(reply) : interaction.reply(reply);
    }

    async handleJoin(interaction) {
        const isSlash = interaction.isChatInputCommand?.() ?? false;
        const member = interaction.member;
        const guild = interaction.guild;

        if (!member.voice.channel) {
            const reply = '❌ You need to be in a voice channel!';
            return isSlash ? interaction.reply({ content: reply, ephemeral: true }) : interaction.reply(reply);
        }

        const queue = this.queueManager.getQueue(guild.id);
        if (!queue.player) {
            try {
                const player = await this.shoukaku.joinVoiceChannel({
                    guildId: guild.id,
                    channelId: member.voice.channel.id,
                    shardId: 0
                });

                queue.player = player;
                const reply = `✅ Joined ${member.voice.channel.name}!`;
                isSlash ? interaction.reply(reply) : interaction.reply(reply);
            } catch (e) {
                console.error('Failed to join voice:', e);
                const reply = '❌ Failed to join voice channel!';
                isSlash ? interaction.reply({ content: reply, ephemeral: true }) : interaction.reply(reply);
            }
        } else {
            const reply = '✅ Already connected!';
            isSlash ? interaction.reply(reply) : interaction.reply(reply);
        }
    }

    async handleLeave(interaction) {
        const isSlash = interaction.isChatInputCommand?.() ?? false;
        const queue = this.queueManager.getQueue(interaction.guild.id);

        if (queue.player) {
            this.queueManager.clearQueue(interaction.guild.id);
            queue.playing = false;
            queue.currentSong = null;
            this.shoukaku.leaveVoiceChannel(interaction.guild.id);
            queue.player = null;
        }

        const reply = '👋 Left the voice channel!';
        isSlash ? interaction.reply(reply) : interaction.reply(reply);
    }

    async handleClear(interaction) {
        const isSlash = interaction.isChatInputCommand?.() ?? false;
        this.queueManager.clearQueue(interaction.guild.id);
        const reply = '🗑️ Queue cleared!';
        isSlash ? interaction.reply(reply) : interaction.reply(reply);
    }

    async handleShuffle(interaction) {
        const isSlash = interaction.isChatInputCommand?.() ?? false;
        const queue = this.queueManager.getQueue(interaction.guild.id);

        if (queue.songs.length < 2) {
            const reply = '❌ Not enough songs to shuffle!';
            return isSlash ? interaction.reply({ content: reply, ephemeral: true }) : interaction.reply(reply);
        }

        this.queueManager.shuffleQueue(interaction.guild.id);
        const reply = '🔀 Queue shuffled!';
        isSlash ? interaction.reply(reply) : interaction.reply(reply);
    }

    async handleLoop(interaction, mode) {
        const isSlash = interaction.isChatInputCommand?.() ?? false;
        this.queueManager.setLoopMode(interaction.guild.id, mode);
        const reply = `🔁 Loop mode set to: **${mode}**`;
        isSlash ? interaction.reply(reply) : interaction.reply(reply);
    }

    async handleSeek(interaction, seconds) {
        const isSlash = interaction.isChatInputCommand?.() ?? false;
        const queue = this.queueManager.getQueue(interaction.guild.id);

        if (!queue.player) {
            const reply = '❌ Nothing is playing!';
            return isSlash ? interaction.reply({ content: reply, ephemeral: true }) : interaction.reply(reply);
        }

        await queue.player.seekTo(seconds * 1000);
        const reply = `⏩ Seeked to ${seconds} seconds!`;
        isSlash ? interaction.reply(reply) : interaction.reply(reply);
    }

    async handleLyrics(interaction, query) {
        const isSlash = interaction.isChatInputCommand?.() ?? false;
        const queue = this.queueManager.getQueue(interaction.guild.id);

        if (!query && !queue.currentSong) {
            const reply = '❌ Please provide a song name!';
            return isSlash ? interaction.reply({ content: reply, ephemeral: true }) : interaction.reply(reply);
        }

        const searchQuery = query || queue.currentSong.title;

        if (isSlash) await interaction.deferReply();

        try {
            const searches = await this.geniusClient.songs.search(searchQuery);
            const firstSong = searches[0];
            const lyrics = await firstSong.lyrics();

            const embed = new EmbedBuilder()
                .setTitle(`Lyrics for ${firstSong.title}`)
                .setDescription(lyrics.length > 4096 ? lyrics.substring(0, 4093) + '...' : lyrics)
                .setColor('#00ff00')
                .setFooter({ text: 'Powered by Genius' });

            const reply = { embeds: [embed] };
            isSlash ? interaction.editReply(reply) : interaction.reply(reply);
        } catch (error) {
            console.error('Lyrics error:', error);
            const reply = '❌ Error fetching lyrics!';
            return isSlash ? interaction.editReply(reply) : interaction.reply(reply);
        }
    }

    async handleHelp(interaction) {
        const isSlash = interaction.isChatInputCommand?.() ?? false;

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('🤖 Music Bot Commands')
            .setDescription('Here are the available commands:')
            .addFields(
                { name: '/play <query>', value: 'Play a song from YouTube or Spotify' },
                { name: '/skip', value: 'Skip the current song' },
                { name: '/stop', value: 'Stop playback and clear queue' },
                { name: '/pause', value: 'Pause playback' },
                { name: '/resume', value: 'Resume playback' },
                { name: '/queue [page]', value: 'Show the current queue (optionally specify page number)' },
                { name: '/queue remove <position>', value: 'Remove a song from the queue' },
                { name: '/queue move <from> <to>', value: 'Move a song in the queue' },
                { name: '/nowplaying', value: 'Show the currently playing song' },
                { name: '/volume <0-100>', value: 'Set the volume' },
                { name: '/seek <seconds>', value: 'Seek to a specific time in the song' },
                { name: '/loop <mode>', value: 'Set loop mode (off, track, queue)' },
                { name: '/shuffle', value: 'Shuffle the queue' },
                { name: '/lyrics [query]', value: 'Get lyrics for current or specified song' },
                { name: '/join', value: 'Join your voice channel' },
                { name: '/leave', value: 'Leave the voice channel' },
                { name: '/clear', value: 'Clear the queue' }
            )
            .setFooter({ text: 'Music Bot' });

        const reply = { embeds: [embed] };
        isSlash ? interaction.reply(reply) : interaction.reply(reply);
    }

    async handlePlaybackFallback(guildId, originalQuery, requester) {
        const node = this.shoukaku.options.nodeResolver(this.shoukaku.nodes);
        if (!node) {
            console.log('❌ No Lavalink node available for fallback');
            await this.queueManager.playNext(guildId);
            return;
        }

        // Try Spotify search
        try {
            console.log(`🔍 Searching Spotify for: ${originalQuery}`);
            const spotifyResults = await this.spotify.searchTracks(originalQuery, { limit: 1 });

            if (spotifyResults.body.tracks.items.length > 0) {
                const track = spotifyResults.body.tracks.items[0];
                const spotifyQuery = `${track.name} ${track.artists[0].name}`;

                // Try SoundCloud with Spotify metadata
                console.log(`🔍 Trying SoundCloud: ${spotifyQuery}`);
                const result = await node.rest.resolve(`scsearch:${spotifyQuery}`);

                if (result && result.loadType === 'search' && result.data.length > 0) {
                    const scTrack = result.data[0];
                    console.log(`✅ Found on SoundCloud: ${scTrack.info.title}`);

                    // Add to queue and play
                    this.queueManager.addSongs(guildId, [scTrack], requester, this.musicPlayer.formatDuration.bind(this.musicPlayer), originalQuery);
                    await this.queueManager.playNext(guildId);
                    return;
                }
            }
        } catch (error) {
            console.error('Fallback failed:', error);
        }

        // All fallbacks failed, skip to next song
        console.log(`❌ All fallback attempts failed for "${originalQuery}", skipping...`);
        await this.queueManager.playNext(guildId);
    }
}

module.exports = CommandHandler;
