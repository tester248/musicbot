const { EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { nowPlayingPayload, queuePayload, queueEmbed, queueTrackActionComponents } = require('./ui');

class CommandHandler {
    constructor(queueManager, musicPlayer, shoukaku, spotify, geniusClient, dashboard, playbackManager, settingsStore = null, playlistsStore = null) {
        this.queueManager = queueManager;
        this.musicPlayer = musicPlayer;
        this.shoukaku = shoukaku;
        this.spotify = spotify;
        this.geniusClient = geniusClient;
        this.dashboard = dashboard;
        this.playbackManager = playbackManager;
        this.settingsStore = settingsStore;
        this.playlistsStore = playlistsStore;
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

    /**
     * Returns true if the user is in the same voice channel as the bot.
     */
    isInBotVoice(interaction, guildId) {
        const memberVc = interaction.member?.voice?.channelId;
        const botVc = interaction.guild?.members?.me?.voice?.channelId;
        return !!memberVc && memberVc === botVc;
    }

    /**
     * Handle interactive components (buttons, select menus).
     */
    async handleComponent(interaction) {
        const customId = interaction.customId || '';
        const guildId = interaction.guild.id;
        const queue = this.queueManager.getQueue(guildId);

        if (customId.startsWith('np:')) {
            return this.handleNowPlayingButton(interaction, customId, guildId, queue);
        }
        if (customId.startsWith('q:')) {
            return this.handleQueueComponent(interaction, customId, guildId, queue);
        }
        if (customId.startsWith('help:')) {
            return this.handleHelpComponent(interaction, customId);
        }
    }

    async handleHelpComponent(interaction, customId) {
        if (customId === 'help:home') {
            return interaction.update(this.helpPayload('music'));
        }
        if (customId.startsWith('help:cat:')) {
            const catId = customId.split(':')[2];
            return interaction.update(this.helpPayload(catId));
        }
        return interaction.deferUpdate();
    }

    /**
     * Extract the current queue page from the embed footer.
     */
    pageFromMessage(message) {
        const footer = message?.embeds?.[0]?.footer?.text || '';
        const m = footer.match(/Page (\d+)\/(\d+)/);
        return m ? parseInt(m[1], 10) : 1;
    }

    /**
     * Now-playing control buttons.
     */
    async handleNowPlayingButton(interaction, customId, guildId, queue) {
        if (!queue.player || !queue.playing) {
            return interaction.reply({ content: '❌ Nothing is playing!', ephemeral: true });
        }
        if (!this.isInBotVoice(interaction, guildId)) {
            return interaction.reply({ content: '❌ You must be in the same voice channel as me to control playback.', ephemeral: true });
        }

        const action = customId.split(':')[1];
        let reRender = false;
        try {
            switch (action) {
                case 'pause':
                    await queue.player.setPaused(true);
                    reRender = true;
                    break;
                case 'resume':
                    await queue.player.setPaused(false);
                    reRender = true;
                    break;
                case 'loop':
                    queue.loopMode = (queue.loopMode + 1) % 3;
                    reRender = true;
                    break;
                case 'skip':
                    await queue.player.stopTrack();
                    break;
                case 'stop':
                    this.queueManager.clearQueue(guildId);
                    queue.playing = false;
                    queue.currentSong = null;
                    await queue.player.stopTrack();
                    break;
                default:
                    return interaction.reply({ content: '❌ Unknown control.', ephemeral: true });
            }
        } catch (e) {
            console.error('Component action error:', e);
            return interaction.reply({ content: '❌ That action failed.', ephemeral: true });
        }

        if (reRender && queue.currentSong && interaction.message?.editable) {
            try {
                await interaction.update(nowPlayingPayload(queue, { paused: queue.player.paused || false }));
                return;
            } catch {}
        }
        try { await interaction.deferUpdate(); } catch {}
    }

    /**
     * Queue panel: pagination + per-track actions.
     */
    async handleQueueComponent(interaction, customId, guildId, queue) {
        const page = this.pageFromMessage(interaction.message);

        if (customId === 'q:prev') {
            return interaction.update(queuePayload(queue, page - 1));
        }
        if (customId === 'q:next') {
            return interaction.update(queuePayload(queue, page + 1));
        }
        if (customId === 'q:cancel') {
            return interaction.update(queuePayload(queue, page));
        }
        if (customId === 'q:pick') {
            const idx = parseInt(interaction.values[0], 10);
            if (isNaN(idx) || !queue.songs[idx]) {
                return interaction.reply({ content: '❌ That track no longer exists.', ephemeral: true });
            }
            try {
                return interaction.update({ embeds: [queueEmbed(queue, page)], components: queueTrackActionComponents(idx) });
            } catch { return interaction.deferUpdate(); }
        }

        const m = customId.match(/^q:(rm|top|play):(\d+)$/);
        if (!m) return interaction.deferUpdate();

        const action = m[1];
        const idx = parseInt(m[2], 10);
        if (isNaN(idx) || !queue.songs[idx]) {
            return interaction.reply({ content: '❌ That track no longer exists.', ephemeral: true });
        }

        try {
            switch (action) {
                case 'rm':
                    queue.songs.splice(idx, 1);
                    break;
                case 'top': {
                    const [song] = queue.songs.splice(idx, 1);
                    queue.songs.unshift(song);
                    break;
                }
                case 'play': {
                    const [song] = queue.songs.splice(idx, 1);
                    queue.songs.unshift(song);
                    if (queue.player) await queue.player.stopTrack();
                    break;
                }
            }
        } catch (e) {
            console.error('Queue action error:', e);
            return interaction.reply({ content: '❌ That action failed.', ephemeral: true });
        }

        try {
            return interaction.update(queuePayload(queue, this.pageFromMessage(interaction.message) || 1));
        } catch { return interaction.deferUpdate(); }
    }

    /**
     * Handle autocomplete interactions (e.g. /play search suggestions).
     */
    async handleAutocomplete(interaction) {
        const { commandName } = interaction;
        const focused = interaction.options.getFocused(true);

        if (commandName === 'play' && focused.name === 'query') {
            const query = focused.value.trim();
            if (query.length < 2) return interaction.respond([]);

            const node = this.playbackManager.getWorkingNode();
            if (!node) return interaction.respond([]);

            try {
                const result = await node.rest.resolve('ytsearch:' + query);
                const items = result && result.loadType === 'search' && Array.isArray(result.data) ? result.data : [];

                const choices = items.slice(0, 10).map(t => {
                    const info = t.info || {};
                    const title = info.title || '';
                    const author = info.author || '';
                    let label = title;
                    if (author) label += ` - ${author}`;
                    if (label.length > 100) label = label.slice(0, 97) + '...';
                    return { name: label, value: label.slice(0, 100) };
                });

                return interaction.respond(choices);
            } catch (e) {
                console.error('Autocomplete error:', e);
                return interaction.respond([]);
            }
        }

        // Unknown / unhandled autocomplete
        return interaction.respond([]);
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
        let spotifyPlaylist = null;

        // Spotify handling
        if (query.includes('spotify.com')) {
            const spotifyResult = await this.musicPlayer.handleSpotifyUrl(query);
            if (spotifyResult.error) {
                return isSlash ? interaction.editReply(spotifyResult.error) : interaction.reply(spotifyResult.error);
            }
            if (spotifyResult.isPlaylist) {
                spotifyPlaylist = spotifyResult;
                playlistName = spotifyResult.playlistName;
            } else {
                query = spotifyResult.query;
                isUrl = spotifyResult.isUrl;
                playlistName = spotifyResult.playlistName;
            }
        }

        if (spotifyPlaylist) {
            // Resolve each Spotify track into a playable Lavalink track.
            for (const t of spotifyPlaylist.playlistTracks) {
                try {
                    const result = await node.rest.resolve('ytsearch:' + `${t.name} ${t.artist}`);
                    if (result) {
                        if (result.loadType === 'search' && result.data && result.data.length) tracks.push(result.data[0]);
                        else if (result.loadType === 'track' && result.data) tracks.push(result.data);
                    }
                } catch (err) {
                    console.error(`Playlist resolve error for "${t.name}":`, err.message);
                }
                await new Promise(res => setTimeout(res, 120));
            }
            if (!tracks.length) {
                const reply = '❌ Could not load any tracks from that playlist!';
                return isSlash ? interaction.editReply(reply) : interaction.reply(reply);
            }
        } else {
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

        const page = Math.max(1, parseInt(args[0], 10) || 1);
        if (!queue.currentSong && queue.songs.length === 0) {
            const reply = '❌ Queue is empty!';
            return isSlash ? interaction.reply({ content: reply, ephemeral: true }) : interaction.reply(reply);
        }

        const payload = queuePayload(queue, page);
        isSlash ? interaction.reply(payload) : interaction.reply(payload);
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

        const payload = nowPlayingPayload(queue, { paused: queue.player?.paused || false });
        isSlash ? interaction.reply(payload) : interaction.reply(payload);
    }

    async handleVolume(interaction, level) {
        const isSlash = interaction.isChatInputCommand?.() ?? false;
        const queue = this.queueManager.getQueue(interaction.guild.id);

        if (level < 0 || level > 100) return isSlash ? interaction.reply({ content: '❌ Volume 0-100!', ephemeral: true }) : interaction.reply('❌ Volume 0-100!');

        this.queueManager.setVolume(interaction.guild.id, level);
        await this.queueManager.refreshFilters(interaction.guild.id);

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

    // ---------- Saved playlists ----------

    getUserPlaylists(userId) {
        const key = `user:${userId}`;
        const lists = this.playlistsStore ? this.playlistsStore.get(key, {}) : {};
        return { key, lists };
    }

    async handlePlaylist(interaction, action, name, query, position) {
        if (!this.playlistsStore) {
            return interaction.reply('❌ Playlists are not available.');
        }
        const isSlash = interaction.isChatInputCommand?.() ?? false;
        const reply = (content, extra = {}) =>
            isSlash ? interaction.reply({ content, ephemeral: true, ...extra }) : interaction.reply({ content, ...extra });

        const userId = interaction.user?.id || interaction.author?.id;
        const plName = (name || '').trim().toLowerCase();

        switch (action) {
            case 'create': {
                if (!plName) return reply('❌ Provide a playlist name.');
                const { key, lists } = this.getUserPlaylists(userId);
                if (lists[plName]) return reply(`❌ Playlist **${name}** already exists.`);
                lists[plName] = [];
                await this.playlistsStore.set(key, lists);
                return reply(`✅ Created playlist **${name}**.`);
            }
            case 'delete': {
                if (!plName) return reply('❌ Provide a playlist name.');
                const { key, lists } = this.getUserPlaylists(userId);
                if (!lists[plName]) return reply(`❌ No playlist named **${name}**.`);
                delete lists[plName];
                await this.playlistsStore.set(key, lists);
                return reply(`🗑️ Deleted playlist **${name}**.`);
            }
            case 'list': {
                const { lists } = this.getUserPlaylists(userId);
                const names = Object.keys(lists);
                if (!names.length) return reply('You have no playlists yet. Use `/playlist create`.');
                const embed = new EmbedBuilder().setColor('#0099ff').setTitle('📚 Your Playlists')
                    .setDescription(names.map((n, i) => `${i + 1}. **${n}** (${lists[n].length} songs)`).join('\n'));
                return isSlash ? interaction.reply({ embeds: [embed] }) : interaction.reply({ embeds: [embed] });
            }
            case 'view': {
                if (!plName) return reply('❌ Provide a playlist name.');
                const { lists } = this.getUserPlaylists(userId);
                const pl = lists[plName];
                if (!pl) return reply(`❌ No playlist named **${name}**.`);
                if (!pl.length) return reply(`Playlist **${name}** is empty.`);
                const lines = pl.slice(0, 15).map((t, i) => `${i + 1}. **${t.title}** — ${t.author}`).join('\n');
                const embed = new EmbedBuilder().setColor('#0099ff').setTitle(`📚 ${name}`)
                    .setDescription(lines).setFooter({ text: `Total songs: ${pl.length}` });
                return isSlash ? interaction.reply({ embeds: [embed] }) : interaction.reply({ embeds: [embed] });
            }
            case 'add': {
                if (!plName || !query) return reply('❌ Provide a playlist name and a song.');
                const node = this.playbackManager.getWorkingNode();
                if (!node) return reply('❌ No Lavalink node available!');
                const isUrl = query.startsWith('http');
                const result = await this.musicPlayer.searchTrack(node, query, isUrl);
                const parsed = this.musicPlayer.parseSearchResult(result);
                if (parsed.error || !parsed.tracks.length) return reply('❌ Could not find that song.');
                const t = parsed.tracks[0];
                const { key, lists } = this.getUserPlaylists(userId);
                if (!lists[plName]) lists[plName] = [];
                lists[plName].push({
                    title: t.info.title,
                    author: t.info.author || 'Unknown',
                    url: t.info.uri || '',
                    query,
                });
                await this.playlistsStore.set(key, lists);
                return reply(`✅ Added **${t.info.title}** to **${name}**.`);
            }
            case 'remove': {
                if (!plName || !position) return reply('❌ Provide a playlist name and a position.');
                const { key, lists } = this.getUserPlaylists(userId);
                const pl = lists[plName];
                if (!pl) return reply(`❌ No playlist named **${name}**.`);
                if (position < 1 || position > pl.length) return reply('❌ Invalid position.');
                const [removed] = pl.splice(position - 1, 1);
                await this.playlistsStore.set(key, lists);
                return reply(`✅ Removed **${removed.title}** from **${name}**.`);
            }
            case 'play': {
                if (!plName) return reply('❌ Provide a playlist name.');
                const { lists } = this.getUserPlaylists(userId);
                const pl = lists[plName];
                if (!pl) return reply(`❌ No playlist named **${name}**.`);
                if (!pl.length) return reply(`Playlist **${name}** is empty.`);
                return this.playSavedPlaylist(interaction, pl, name);
            }
            default:
                return reply('❌ Unknown playlist action.');
        }
    }

    async playSavedPlaylist(interaction, pl, playlistName) {
        const isSlash = interaction.isChatInputCommand?.() ?? false;
        const member = interaction.member;
        const guild = interaction.guild;

        if (!member.voice.channel) {
            const r = '❌ You need to be in a voice channel to play music!';
            return isSlash ? interaction.reply({ content: r, ephemeral: true }) : interaction.reply(r);
        }
        const permError = this.checkVcAccess(interaction, member.voice.channel);
        if (permError) return isSlash ? interaction.reply({ content: permError, ephemeral: true }) : interaction.reply(permError);

        if (isSlash) await interaction.deferReply();

        const node = this.playbackManager.getWorkingNode();
        if (!node) {
            const r = '❌ No Lavalink node available!';
            return isSlash ? interaction.editReply(r) : interaction.reply(r);
        }

        const tracks = [];
        const MAX = 25;
        for (const item of pl) {
            if (tracks.length >= MAX) break;
            const q = item.url || `${item.title} ${item.author}`;
            const isUrl = !!item.url;
            try {
                const result = await this.musicPlayer.searchTrack(node, q, isUrl);
                const parsed = this.musicPlayer.parseSearchResult(result);
                if (!parsed.error && parsed.tracks.length) tracks.push(parsed.tracks[0]);
            } catch {}
            await new Promise(res => setTimeout(res, 120));
        }
        if (!tracks.length) {
            const r = '❌ Could not load any tracks from that playlist!';
            return isSlash ? interaction.editReply(r) : interaction.reply(r);
        }

        const queue = this.queueManager.getQueue(guild.id);
        let player = queue.player || this.shoukaku.players.get(guild.id);
        if (!player && this.shoukaku.connections.has(guild.id)) {
            try { await this.shoukaku.leaveVoiceChannel(guild.id); } catch {}
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
                player = this.shoukaku.players.get(guild.id);
                if (!player) {
                    console.error('Failed to join voice:', e);
                    const r = '❌ Failed to join voice channel!';
                    return isSlash ? interaction.editReply(r) : interaction.reply(r);
                }
            }
            this.playbackManager.setupPlayerEvents(player, guild.id, interaction.channel);
            queue.player = player;
        }
        queue.textChannel = interaction.channel;
        this.queueManager.addSongs(guild.id, tracks, member.user, this.musicPlayer.formatDuration.bind(this.musicPlayer), playlistName);
        if (!queue.playing) this.queueManager.playNext(guild.id);
        const payload = this.musicPlayer.createQueueEmbed(tracks, playlistName, null);
        isSlash ? interaction.editReply(payload) : interaction.reply(payload);
    }

    async handleFilter(interaction, mode, value) {
        const isSlash = interaction.isChatInputCommand?.() ?? false;
        const guildId = interaction.guild.id;
        const queue = this.queueManager.getQueue(guildId);

        const replyErr = (msg) => isSlash
            ? interaction.reply({ content: `❌ ${msg}`, ephemeral: true })
            : interaction.reply(`❌ ${msg}`);

        if (!queue.player || !queue.playing) return replyErr('Nothing is playing!');

        const f = queue.filters;
        switch (mode) {
            case 'bassboost': f.bassboost = !f.bassboost; break;
            case 'nightcore': f.nightcore = !f.nightcore; break;
            case '8d': f['8d'] = !f['8d']; break;
            case 'karaoke': f.karaoke = !f.karaoke; break;
            case 'vibrato': f.vibrato = !f.vibrato; break;
            case 'speed':
                if (typeof value !== 'number') return replyErr('Provide a value (0.5–2).');
                f.speed = Math.min(2, Math.max(0.5, value));
                break;
            case 'pitch':
                if (typeof value !== 'number') return replyErr('Provide a value (0.5–2).');
                f.pitch = Math.min(2, Math.max(0.5, value));
                break;
            case 'reset':
                Object.assign(f, { bassboost: false, nightcore: false, '8d': false, karaoke: false, vibrato: false, speed: 1, pitch: 1 });
                break;
            default:
                return replyErr('Unknown filter.');
        }

        await this.queueManager.refreshFilters(guildId);

        const parts = [];
        if (f.bassboost) parts.push('🏋 Bassboost');
        if (f.nightcore) parts.push('🌙 Nightcore');
        if (f['8d']) parts.push('🔊 8D');
        if (f.karaoke) parts.push('🎤 Karaoke');
        if (f.vibrato) parts.push('〰️ Vibrato');
        if (f.speed !== 1) parts.push(`⚡ Speed ${f.speed}x`);
        if (f.pitch !== 1) parts.push(`🎵 Pitch ${f.pitch}x`);
        const status = parts.length ? parts.join(' · ') : 'Off (default)';
        const r = `🎛️ Filters: ${status}`;
        return isSlash ? interaction.reply({ content: r, ephemeral: true }) : interaction.reply(r);
    }

    // ---------- Controller channel ----------

    async handleController(interaction, action, channel) {
        const isSlash = interaction.isChatInputCommand?.() ?? false;
        const guildId = interaction.guild.id;
        const reply = (content) => isSlash ? interaction.reply({ content, ephemeral: true }) : interaction.reply(content);

        const g = this.settingsStore ? this.settingsStore.guild(guildId) : {};
        const action2 = action || 'view';

        if (action2 === 'setup') {
            if (!channel) return reply('❌ Specify a text channel.');
            g.controllerChannelId = channel.id;
            if (this.settingsStore) await this.settingsStore.saveGuild(guildId);
            return reply(`✅ Controller channel set to <#${channel.id}>. Type a song name there to play it!`);
        }
        if (action2 === 'disable') {
            delete g.controllerChannelId;
            if (this.settingsStore) await this.settingsStore.saveGuild(guildId);
            return reply('🗑️ Controller channel disabled.');
        }
        // view
        if (g.controllerChannelId) {
            return reply(`🎛️ Controller: <#${g.controllerChannelId}>. Type a song name there to play it.`);
        }
        return reply('No controller channel set. Use `/controller setup` to set one.');
    }

    /**
     * Called on every message in a guild. If the message is in a configured
     * controller channel (and isn't a command), treat it as a play request.
     */
    async handleControllerMessage(message) {
        const guildId = message.guild?.id;
        if (!guildId || !this.settingsStore) return false;
        const g = this.settingsStore.guild(guildId);
        if (!g.controllerChannelId || message.channel.id !== g.controllerChannelId) return false;

        // Skip bot messages and anything that looks like a command
        if (message.author.bot) return false;
        const content = message.content.trim();
        const prefix = process.env.PREFIX || '!';
        if (!content || content.startsWith(prefix) || content.startsWith('/')) return false;

        try {
            await this.handlePlay(message, content);
            return true;
        } catch (e) {
            console.error('Controller message error:', e);
            return false;
        }
    }

    // ---------- Interactive help menu ----------

    HELP_CATEGORIES() {
        return [
            {
                id: 'music',
                emoji: '🎵',
                label: 'Music',
                commands: [
                    ['/play', 'Play a song (with live search suggestions)'],
                    ['/skip', 'Skip the current track'],
                    ['/stop', 'Stop playback and clear the queue'],
                    ['/pause', 'Pause the current track'],
                    ['/resume', 'Resume playback'],
                    ['/queue', 'Show / manage the queue (interactive)'],
                    ['/nowplaying', 'Show what is playing (with controls)'],
                    ['/volume', 'Set volume (0–100)'],
                    ['/seek', 'Seek to a time'],
                    ['/loop', 'Set loop mode (off/track/queue)'],
                    ['/shuffle', 'Shuffle the queue'],
                    ['/lyrics', 'Get lyrics for the current track'],
                    ['/join', 'Join your voice channel'],
                    ['/leave', 'Leave the voice channel'],
                    ['/clear', 'Clear the queue'],
                ],
            },
            {
                id: 'playlists',
                emoji: '📚',
                label: 'Playlists',
                commands: [
                    ['/playlist create <name>', 'Create a playlist'],
                    ['/playlist add <name> <song>', 'Add a song to a playlist'],
                    ['/playlist play <name>', 'Play a saved playlist'],
                    ['/playlist view <name>', 'View a playlist'],
                    ['/playlist remove <name> <pos>', 'Remove a track from a playlist'],
                    ['/playlist delete <name>', 'Delete a playlist'],
                    ['/playlist list', 'List your playlists'],
                ],
            },
            {
                id: 'filters',
                emoji: '🎛️',
                label: 'Filters',
                commands: [
                    ['/filter bassboost', 'Toggle bass boost'],
                    ['/filter nightcore', 'Toggle nightcore'],
                    ['/filter 8d', 'Toggle 8D rotation'],
                    ['/filter karaoke', 'Toggle karaoke'],
                    ['/filter vibrato', 'Toggle vibrato'],
                    ['/filter speed <0.5-2>', 'Set speed'],
                    ['/filter pitch <0.5-2>', 'Set pitch'],
                    ['/filter reset', 'Reset all filters'],
                ],
            },
            {
                id: 'controller',
                emoji: '🎮',
                label: 'Controller',
                commands: [
                    ['/controller setup <#channel>', 'Set the controller channel'],
                    ['/controller view', 'Show the controller channel'],
                    ['/controller disable', 'Disable the controller channel'],
                    ['(in controller channel)', 'Type any song name to play it'],
                ],
            },
            {
                id: 'utility',
                emoji: '⚙️',
                label: 'Utility',
                commands: [
                    ['/help', 'Open this menu'],
                    ['/dashboard', 'Open the web dashboard'],
                ],
            },
        ];
    }

    helpPayload(categoryId) {
        const cats = this.HELP_CATEGORIES();
        const cat = cats.find(c => c.id === categoryId) || cats[0];

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(`${cat.emoji} ${cat.label} Commands`)
            .setDescription(`Everything **${cat.label}**-related. Click a category below to browse.`)
            .addFields(cat.commands.map(([name, desc]) => ({ name, value: desc, inline: false })))
            .setFooter({ text: 'FlaviBot-style interactive help' });

        const home = new ButtonBuilder()
            .setCustomId('help:home')
            .setEmoji('🏠')
            .setLabel('Home')
            .setStyle(ButtonStyle.Secondary);

        const catButtons = cats.map(c => new ButtonBuilder()
            .setCustomId(`help:cat:${c.id}`)
            .setEmoji(c.emoji)
            .setLabel(c.label)
            .setStyle(c.id === cat.id ? ButtonStyle.Primary : ButtonStyle.Secondary));

        const rows = [];
        rows.push(new ActionRowBuilder().addComponents(home, ...catButtons.slice(0, 4)));
        if (catButtons.length > 4) {
            rows.push(new ActionRowBuilder().addComponents(...catButtons.slice(4)));
        }
        return { embeds: [embed], components: rows };
    }

    async handleHelp(interaction) {
        const payload = this.helpPayload('music');
        interaction.reply(payload);
    }
}

module.exports = CommandHandler;
