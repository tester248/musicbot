const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

class CommandHandler {
    constructor(queueManager, musicPlayer, shoukaku, spotify, geniusClient, dashboard, playbackManager) {
        this.queueManager = queueManager;
        this.musicPlayer = musicPlayer;
        this.shoukaku = shoukaku;
        this.spotify = spotify;
        this.geniusClient = geniusClient;
        this.dashboard = dashboard;
        this.playbackManager = playbackManager;
    }

    /**
     * Validate the bot's access to a voice channel before attempting to join.
     * Returns an error string if it cannot join, or null if joining is allowed.
     */
    checkVcAccess(interaction, channel) {
        const me = interaction.guild?.members?.me;
        if (!me) return null;

        const perms = me.permissionsIn(channel);
        if (!perms.has(PermissionFlagsBits.ViewChannel)) {
            return '❌ I need **View Channel** permission to see that voice channel.';
        }
        if (!perms.has(PermissionFlagsBits.Connect)) {
            return '❌ I don\'t have permission to **connect** to that voice channel (it may be private or restricted).';
        }
        if (!perms.has(PermissionFlagsBits.Speak)) {
            return '⚠️ I don\'t have **Speak** permission in that channel — I can join but will be silent.';
        }
        return null;
    }

    async handlePlay(interaction, query) {
        const isSlash = interaction.isChatInputCommand?.() ?? false;
        const member = interaction.member;
        const guild = interaction.guild;

        if (!member.voice.channel) {
            const reply = '❌ You need to be in a voice channel to play music!';
            return isSlash ? interaction.reply({ content: reply, ephemeral: true }) : interaction.reply(reply);
        }

        const permError = this.checkVcAccess(interaction, member.voice.channel);
        if (permError) return isSlash ? interaction.reply({ content: permError, ephemeral: true }) : interaction.reply(permError);

        if (!query) {
            const reply = '❌ Please provide a song name or URL!';
            return isSlash ? interaction.reply({ content: reply, ephemeral: true }) : interaction.reply(reply);
        }

        if (isSlash) await interaction.deferReply();

        const node = this.playbackManager.getWorkingNode();
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

        // Reuse an existing connection if Shoukaku already has a player for this guild.
        // Note: Shoukaku tracks live voice connections separately from players, so a
        // stale connection can linger without a player and make joinVoiceChannel throw.
        let player = queue.player || this.shoukaku.players.get(guild.id);
        if (!player && this.shoukaku.connections.has(guild.id)) {
            try {
                await this.shoukaku.leaveVoiceChannel(guild.id);
            } catch (cleanupErr) {
                console.error('Error clearing stale voice connection:', cleanupErr);
            }
        }
        if (!player) {
            try {
                player = await this.shoukaku.joinVoiceChannel({
                    guildId: guild.id,
                    channelId: member.voice.channel.id,
                    shardId: guild.shardId || 0,
                    deaf: true,
                    nodeName: node.name
                });
            } catch (e) {
                // Race: a connection may have been established between our check and the join
                player = this.shoukaku.players.get(guild.id);
                if (!player) {
                    console.error('Failed to join voice:', e);
                    const reply = '❌ Failed to join voice channel!';
                    return isSlash ? interaction.editReply(reply) : interaction.reply(reply);
                }
            }
            this.playbackManager.setupPlayerEvents(player, guild.id, interaction.channel);
            queue.player = player;
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

        if (!queue.player || !queue.playing) {
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

        if (subcommand === 'remove') return this.handleQueueRemove(interaction, args[0]);
        if (subcommand === 'move') return this.handleQueueMove(interaction, args[0], args[1]);

        const page = args[0] || 1;
        if (!queue.currentSong && queue.songs.length === 0) {
            const reply = '❌ Queue is empty!';
            return isSlash ? interaction.reply({ content: reply, ephemeral: true }) : interaction.reply(reply);
        }

        const songsPerPage = 10;
        const totalPages = Math.ceil(queue.songs.length / songsPerPage);
        const currentPage = Math.max(1, Math.min(page, totalPages || 1));
        const startIndex = (currentPage - 1) * songsPerPage;
        
        const embed = new EmbedBuilder().setColor('#0099ff').setTitle('🎶 Music Queue');
        if (queue.currentSong) embed.addFields({ name: 'Now Playing', value: `**${queue.currentSong.title}** | Requested by: ${queue.currentSong.requester}` });

        if (queue.songs.length > 0) {
            const queueList = queue.songs.slice(startIndex, startIndex + songsPerPage).map((song, index) => `${startIndex + index + 1}. **${song.title}** (${song.duration})`).join('\n');
            embed.setDescription(`**Up Next:**\n${queueList}`);
            if (totalPages > 1) embed.setFooter({ text: `Page ${currentPage}/${totalPages} | Total songs: ${queue.songs.length}` });
        } else {
            embed.setDescription('No more songs in queue.');
        }

        isSlash ? interaction.reply({ embeds: [embed] }) : interaction.reply({ embeds: [embed] });
    }

    async handleQueueRemove(interaction, position) {
        const isSlash = interaction.isChatInputCommand?.() ?? false;
        if (!position || isNaN(position)) return isSlash ? interaction.reply({ content: '❌ Invalid position!', ephemeral: true }) : interaction.reply('❌ Invalid position!');

        const result = this.queueManager.removeSong(interaction.guild.id, parseInt(position));
        if (!result.success) return isSlash ? interaction.reply({ content: `❌ ${result.error}`, ephemeral: true }) : interaction.reply(`❌ ${result.error}`);

        interaction.reply(`✅ Removed from queue: **${result.song.title}**`);
    }

    async handleQueueMove(interaction, fromPosition, toPosition) {
        const isSlash = interaction.isChatInputCommand?.() ?? false;
        if (isNaN(fromPosition) || isNaN(toPosition)) return isSlash ? interaction.reply({ content: '❌ Invalid positions!', ephemeral: true }) : interaction.reply('❌ Invalid positions!');

        const result = this.queueManager.moveSong(interaction.guild.id, parseInt(fromPosition), parseInt(toPosition));
        if (!result.success) return isSlash ? interaction.reply({ content: `❌ ${result.error}`, ephemeral: true }) : interaction.reply(`❌ ${result.error}`);

        interaction.reply(`✅ Moved **${result.song.title}** from ${fromPosition} to ${toPosition}`);
    }

    async handleNowPlaying(interaction) {
        const isSlash = interaction.isChatInputCommand?.() ?? false;
        const queue = this.queueManager.getQueue(interaction.guild.id);

        if (!queue.currentSong) return isSlash ? interaction.reply({ content: '❌ Nothing is playing!', ephemeral: true }) : interaction.reply('❌ Nothing is playing!');

        const song = queue.currentSong;
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('🎶 Now Playing')
            .setDescription(`**${song.title}**`)
            .addFields(
                { name: 'Duration', value: song.duration, inline: true },
                { name: 'Requested by', value: song.requester.toString(), inline: true }
            );
        if (song.thumbnail) embed.setThumbnail(song.thumbnail);

        isSlash ? interaction.reply({ embeds: [embed] }) : interaction.reply({ embeds: [embed] });
    }

    async handleVolume(interaction, level) {
        const isSlash = interaction.isChatInputCommand?.() ?? false;
        const queue = this.queueManager.getQueue(interaction.guild.id);

        if (level < 0 || level > 100) return isSlash ? interaction.reply({ content: '❌ Volume 0-100!', ephemeral: true }) : interaction.reply('❌ Volume 0-100!');

        this.queueManager.setVolume(interaction.guild.id, level);
        if (queue.player) await queue.player.setFilters({ volume: level / 100 });

        interaction.reply(`🔊 Volume set to ${level}%`);
    }

    async handleJoin(interaction) {
        const isSlash = interaction.isChatInputCommand?.() ?? false;
        const member = interaction.member;
        if (!member.voice.channel) return isSlash ? interaction.reply({ content: '❌ You need to be in a voice channel!', ephemeral: true }) : interaction.reply('❌ You need to be in a voice channel!');

        const permError = this.checkVcAccess(interaction, member.voice.channel);
        if (permError) return isSlash ? interaction.reply({ content: permError, ephemeral: true }) : interaction.reply(permError);

        const guildId = interaction.guild.id;
        const queue = this.queueManager.getQueue(guildId);

        // Ground truth: Shoukaku keeps voice connections separate from players; a
        // connection can linger without a player (e.g. after a node died) and make
        // joinVoiceChannel throw 'already have an existing connection'.
        const existing = queue.player || this.shoukaku.players.get(guildId);
        if (existing) {
            queue.player = existing;
            this.playbackManager.setupPlayerEvents(existing, guildId, interaction.channel);
            return interaction.reply('✅ Already connected!');
        }

        // Stale connection with no player → clear it so we can reconnect cleanly
        if (this.shoukaku.connections.has(guildId)) {
            try {
                await this.shoukaku.leaveVoiceChannel(guildId);
            } catch (cleanupErr) {
                console.error('Error clearing stale voice connection:', cleanupErr);
            }
        }

        try {
            const node = this.playbackManager.getWorkingNode();
            if (!node) return interaction.reply('❌ No Lavalink node available!');

            const player = await this.shoukaku.joinVoiceChannel({
                guildId,
                channelId: member.voice.channel.id,
                shardId: interaction.guild.shardId || 0,
                deaf: true,
                nodeName: node.name
            });

            this.playbackManager.setupPlayerEvents(player, guildId, interaction.channel);
            queue.player = player;
            interaction.reply(`✅ Joined ${member.voice.channel.name}!`);
        } catch (e) {
            console.error(e);
            // Recover if a connection actually exists despite our earlier check
            const player = this.shoukaku.players.get(guildId);
            if (player) {
                queue.player = player;
                this.playbackManager.setupPlayerEvents(player, guildId, interaction.channel);
                return interaction.reply('✅ Already connected!');
            }
            interaction.reply('❌ Failed to join!');
        }
    }

    async handleLeave(interaction) {
        const guildId = interaction.guild.id;
        const queue = this.queueManager.getQueue(guildId);

        this.queueManager.clearQueue(guildId);
        queue.playing = false;
        queue.currentSong = null;
        queue.previousSong = null;

        // Tear down the voice connection whenever Shoukaku tracks one. A connection can
        // exist without a player, so guard on both maps, not just the player.
        if (this.shoukaku.connections.has(guildId) || this.shoukaku.players.has(guildId)) {
            try {
                await this.shoukaku.leaveVoiceChannel(guildId);
            } catch (e) {
                console.error('Error leaving voice channel:', e);
            }
        }
        queue.player = null;

        interaction.reply('👋 Left!');
    }

    async handleClear(interaction) {
        this.queueManager.clearQueue(interaction.guild.id);
        interaction.reply('🗑️ Queue cleared!');
    }

    async handleShuffle(interaction) {
        const queue = this.queueManager.getQueue(interaction.guild.id);
        if (queue.songs.length < 2) return interaction.reply('❌ Not enough songs!');
        this.queueManager.shuffleQueue(interaction.guild.id);
        interaction.reply('🔀 Shuffled!');
    }

    async handleLoop(interaction, mode) {
        this.queueManager.setLoopMode(interaction.guild.id, mode);
        interaction.reply(`🔁 Loop: **${mode}**`);
    }

    async handleSeek(interaction, seconds) {
        const queue = this.queueManager.getQueue(interaction.guild.id);
        if (!queue.player) return interaction.reply('❌ Nothing is playing!');
        await queue.player.seekTo(seconds * 1000);
        interaction.reply(`⏩ Seeked to ${seconds}s!`);
    }

    async handleLyrics(interaction, query) {
        const isSlash = interaction.isChatInputCommand?.() ?? false;
        const queue = this.queueManager.getQueue(interaction.guild.id);
        const searchQuery = query || queue.currentSong?.title;
        if (!searchQuery) return isSlash ? interaction.reply({ content: '❌ Provide a song!', ephemeral: true }) : interaction.reply('❌ Provide a song!');

        if (isSlash) await interaction.deferReply();
        try {
            const searches = await this.geniusClient.songs.search(searchQuery);
            const lyrics = await searches[0].lyrics();
            const embed = new EmbedBuilder().setTitle(`Lyrics: ${searches[0].title}`).setDescription(lyrics.length > 4096 ? lyrics.substring(0, 4093) + '...' : lyrics).setColor('#00ff00');
            isSlash ? interaction.editReply({ embeds: [embed] }) : interaction.reply({ embeds: [embed] });
        } catch (e) {
            isSlash ? interaction.editReply('❌ No lyrics found!') : interaction.reply('❌ No lyrics found!');
        }
    }

    async handleHelp(interaction) {
        const embed = new EmbedBuilder().setColor('#0099ff').setTitle('🤖 Commands').addFields(
            { name: '/play', value: 'Play music' },
            { name: '/skip', value: 'Skip' },
            { name: '/queue', value: 'Show/Manage queue' },
            { name: '/nowplaying', value: 'Now playing' },
            { name: '/lyrics', value: 'Lyrics' }
        );
        interaction.reply({ embeds: [embed] });
    }
}

module.exports = CommandHandler;
