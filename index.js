require('dotenv').config();
const { Client, GatewayIntentBits, Collection, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActivityType } = require('discord.js');
const { Shoukaku, Connectors } = require('shoukaku');
const SpotifyWebApi = require('spotify-web-api-node');
const Genius = require('genius-lyrics');

const Nodes = [{
    name: 'Localhost',
    url: 'localhost:2333',
    auth: 'youshallnotpass'
}];

class MusicBot {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildVoiceStates,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
            ],
        });

        this.queues = new Collection();
        this.shoukaku = new Shoukaku(new Connectors.DiscordJS(this.client), Nodes);
        
        // Initialize Spotify API
        this.spotify = new SpotifyWebApi({
            clientId: process.env.SPOTIFY_CLIENT_ID,
            clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
        });

        this.geniusClient = new Genius.Client();
        
        // Spotify Token Refresh
        this.spotifyTokenTimer = null;
        this.refreshSpotifyToken();

        this.setupShoukaku();
        this.setupClient();
    }

    async refreshSpotifyToken() {
        try {
            const data = await this.spotify.clientCredentialsGrant();
            this.spotify.setAccessToken(data.body['access_token']);
            // Refresh 1 minute before expiry
            setTimeout(() => this.refreshSpotifyToken(), (data.body['expires_in'] - 60) * 1000);
            console.log('✅ Spotify token refreshed');
        } catch (error) {
            console.error('❌ Spotify token refresh failed:', error);
            // Retry in 30 seconds
            setTimeout(() => this.refreshSpotifyToken(), 30000);
        }
    }

    setupShoukaku() {
        this.shoukaku.on('error', (_, error) => console.error('Shoukaku: Error', error));
        this.shoukaku.on('close', (name, code, reason) => console.warn(`Shoukaku: Closed ${name} ${code} ${reason}`));
        this.shoukaku.on('disconnect', (name, players, moved) => console.warn(`Shoukaku: Disconnected ${name} ${players} ${moved}`));
        this.shoukaku.on('ready', (name) => console.log(`✅ Shoukaku: Node ${name} is ready`));
    }

    setupClient() {
        this.client.on('ready', () => {
            console.log(`✅ Bot is ready! Logged in as ${this.client.user.tag}`);
            this.client.user.setActivity('Music 🎵 | /play', { type: ActivityType.Listening });
            this.registerSlashCommands();
        });

        this.client.on('interactionCreate', async (interaction) => {
            if (!interaction.isChatInputCommand()) return;

            const command = interaction.commandName;

            try {
                switch (command) {
                    case 'play':
                        await this.handlePlay(interaction, interaction.options.getString('query'));
                        break;
                    case 'skip':
                        await this.handleSkip(interaction);
                        break;
                    case 'stop':
                        await this.handleStop(interaction);
                        break;
                    case 'pause':
                        await this.handlePause(interaction);
                        break;
                    case 'resume':
                        await this.handleResume(interaction);
                        break;
                    case 'queue':
                        await this.handleQueue(interaction);
                        break;
                    case 'nowplaying':
                        await this.handleNowPlaying(interaction);
                        break;
                    case 'volume':
                        await this.handleVolume(interaction, interaction.options.getInteger('level'));
                        break;
                    case 'join':
                        await this.handleJoin(interaction);
                        break;
                    case 'leave':
                        await this.handleLeave(interaction);
                        break;
                    case 'clear':
                        await this.handleClear(interaction);
                        break;
                    case 'shuffle':
                        await this.handleShuffle(interaction);
                        break;
                    case 'loop':
                        await this.handleLoop(interaction, interaction.options.getString('mode'));
                        break;
                    case 'seek':
                        await this.handleSeek(interaction, interaction.options.getInteger('seconds'));
                        break;
                    case 'lyrics':
                        await this.handleLyrics(interaction, interaction.options.getString('query'));
                        break;
                }
            } catch (error) {
                console.error('Interaction error:', error);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: '❌ An error occurred!', ephemeral: true });
                } else {
                    await interaction.editReply('❌ An error occurred!');
                }
            }
        });

        // Prefix command handler
        this.client.on('messageCreate', async (message) => {
            if (message.author.bot) return;
            const prefix = process.env.PREFIX || '!';
            if (!message.content.startsWith(prefix)) return;

            const args = message.content.slice(prefix.length).trim().split(/ +/);
            const command = args.shift().toLowerCase();

            try {
                switch (command) {
                    case 'play':
                    case 'p':
                        await this.handlePlay(message, args.join(' '));
                        break;
                    case 'skip':
                    case 's':
                        await this.handleSkip(message);
                        break;
                    case 'stop':
                        await this.handleStop(message);
                        break;
                    case 'pause':
                        await this.handlePause(message);
                        break;
                    case 'resume':
                    case 'r':
                        await this.handleResume(message);
                        break;
                    case 'queue':
                    case 'q':
                        await this.handleQueue(message);
                        break;
                    case 'nowplaying':
                    case 'np':
                        await this.handleNowPlaying(message);
                        break;
                    case 'volume':
                    case 'vol':
                    case 'v':
                        await this.handleVolume(message, parseInt(args[0]));
                        break;
                    case 'join':
                    case 'j':
                        await this.handleJoin(message);
                        break;
                    case 'leave':
                    case 'l':
                    case 'dc':
                        await this.handleLeave(message);
                        break;
                    case 'clear':
                    case 'c':
                        await this.handleClear(message);
                        break;
                    case 'shuffle':
                        await this.handleShuffle(message);
                        break;
                    case 'loop':
                        await this.handleLoop(message, args[0]);
                        break;
                    case 'seek':
                        await this.handleSeek(message, parseInt(args[0]));
                        break;
                    case 'lyrics':
                    case 'ly':
                        await this.handleLyrics(message, args.join(' '));
                        break;
                }
            } catch (error) {
                console.error('Prefix command error:', error);
                message.reply('❌ An error occurred while executing the command.');
            }
        });
    }

    async registerSlashCommands() {
        const commands = [
            new SlashCommandBuilder()
                .setName('play')
                .setDescription('Play a song from YouTube or Spotify')
                .addStringOption(option =>
                    option.setName('query')
                        .setDescription('Song name, YouTube URL, or Spotify URL')
                        .setRequired(true)),
            new SlashCommandBuilder()
                .setName('skip')
                .setDescription('Skip the current song'),
            new SlashCommandBuilder()
                .setName('stop')
                .setDescription('Stop playback and clear queue'),
            new SlashCommandBuilder()
                .setName('pause')
                .setDescription('Pause the current song'),
            new SlashCommandBuilder()
                .setName('resume')
                .setDescription('Resume the current song'),
            new SlashCommandBuilder()
                .setName('queue')
                .setDescription('Show the current queue'),
            new SlashCommandBuilder()
                .setName('nowplaying')
                .setDescription('Show the currently playing song'),
            new SlashCommandBuilder()
                .setName('volume')
                .setDescription('Set the volume (0-100)')
                .addIntegerOption(option =>
                    option.setName('level')
                        .setDescription('Volume level (0-100)')
                        .setRequired(true)
                        .setMinValue(0)
                        .setMaxValue(100)),
            new SlashCommandBuilder()
                .setName('join')
                .setDescription('Join your voice channel'),
            new SlashCommandBuilder()
                .setName('leave')
                .setDescription('Leave the voice channel'),
            new SlashCommandBuilder()
                .setName('clear')
                .setDescription('Clear the queue'),
            new SlashCommandBuilder()
                .setName('shuffle')
                .setDescription('Shuffle the queue'),
            new SlashCommandBuilder()
                .setName('loop')
                .setDescription('Set loop mode')
                .addStringOption(option =>
                    option.setName('mode')
                        .setDescription('Loop mode (off, track, queue)')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Off', value: 'off' },
                            { name: 'Track', value: 'track' },
                            { name: 'Queue', value: 'queue' }
                        )),
            new SlashCommandBuilder()
                .setName('seek')
                .setDescription('Seek to a specific time')
                .addIntegerOption(option =>
                    option.setName('seconds')
                        .setDescription('Time in seconds')
                        .setRequired(true)
                        .setMinValue(0)),
            new SlashCommandBuilder()
                .setName('lyrics')
                .setDescription('Get lyrics for a song')
                .addStringOption(option =>
                    option.setName('query')
                        .setDescription('Song name')
                        .setRequired(false))
        ];

        try {
            console.log('🔄 Registering slash commands...');
            await this.client.application.commands.set([]);
            await this.client.application.commands.set(commands);
            console.log('✅ Slash commands registered successfully!');
        } catch (error) {
            console.error('Error registering slash commands:', error);
        }
    }

    getQueue(guildId) {
        if (!this.queues.has(guildId)) {
            this.queues.set(guildId, {
                songs: [],
                currentSong: null,
                playing: false,
                loopMode: 0, // 0: off, 1: track, 2: queue
                volume: parseInt(process.env.DEFAULT_VOLUME) || 100,
                player: null
            });
        }
        return this.queues.get(guildId);
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
            try {
                const url = new URL(query);
                const pathParts = url.pathname.split('/');
                // Handle different spotify URL formats
                // https://open.spotify.com/track/ID
                // https://open.spotify.com/intl-pt/track/ID
                let id = pathParts[pathParts.length - 1];
                let type = pathParts[pathParts.length - 2];
                
                // Basic cleanup for ID (remove query params if any remain after URL parsing)
                if (id.includes('?')) id = id.split('?')[0];

                if (type === 'track') {
                    const data = await this.spotify.getTrack(id);
                    const track = data.body;
                    query = `${track.name} ${track.artists[0].name}`;
                    isUrl = false; // Convert to search query
                } else if (type === 'playlist') {
                    const data = await this.spotify.getPlaylist(id);
                    const playlist = data.body;
                    playlistName = playlist.name;
                    
                    // For now, just play the first track to avoid complex queueing logic in this simple implementation
                    // A full implementation would map all tracks to YouTube searches
                    if (playlist.tracks.items.length > 0) {
                        const item = playlist.tracks.items[0];
                        if (item.track) {
                            query = `${item.track.name} ${item.track.artists[0].name}`;
                            isUrl = false;
                        }
                    } else {
                         const reply = '❌ Playlist is empty!';
                         return isSlash ? interaction.editReply(reply) : interaction.reply(reply);
                    }
                }
            } catch (error) {
                console.error('Spotify error:', error);
                // Don't return error, let it try to resolve as URL or search as fallback
            }
        }

        try {
            const searchType = isUrl ? '' : (query.startsWith('scsearch:') ? '' : 'ytsearch:');
            const result = await node.rest.resolve(isUrl ? query : `${searchType}${query}`);
            
            if (!result || result.loadType === 'empty') {
                const reply = '❌ No results found!';
                return isSlash ? interaction.editReply(reply) : interaction.reply(reply);
            }

            if (result.loadType === 'playlist') {
                tracks = result.data.tracks;
                playlistName = result.data.info.name;
            } else if (result.loadType === 'track') {
                tracks = [result.data];
            } else if (result.loadType === 'search') {
                // Only take the first search result
                tracks = result.data && result.data.length > 0 ? [result.data[0]] : [];
            } else if (result.loadType === 'error') {
                console.error('Lavalink error:', result.data);
                const reply = `❌ Error: ${result.data.message || 'Failed to load track'}`;
                return isSlash ? interaction.editReply(reply) : interaction.reply(reply);
            } else {
                console.error('Unknown loadType:', result.loadType);
                tracks = Array.isArray(result.data) ? result.data : [result.data];
            }
        } catch (err) {
            console.error('Lavalink resolve error:', err);
            const reply = '❌ Error searching for song!';
            return isSlash ? interaction.editReply(reply) : interaction.reply(reply);
        }

        if (!tracks || tracks.length === 0) {
            const reply = '❌ No tracks found!';
            return isSlash ? interaction.editReply(reply) : interaction.reply(reply);
        }

        const queue = this.getQueue(guild.id);

        // Join voice channel if needed
        if (!queue.player) {
            try {
                const player = await this.shoukaku.joinVoiceChannel({
                    guildId: guild.id,
                    channelId: member.voice.channel.id,
                    shardId: 0 // Assuming single shard
                });

                player.on('start', () => {
                    console.log('Track started');
                });

                player.on('end', () => {
                    this.playNext(guild.id);
                });

                player.on('exception', (err) => {
                    console.error('Track exception:', err);
                    this.playNext(guild.id);
                });

                queue.player = player;
            } catch (e) {
                console.error('Failed to join voice:', e);
                const reply = '❌ Failed to join voice channel!';
                return isSlash ? interaction.editReply(reply) : interaction.reply(reply);
            }
        }

        // Add tracks to queue
        for (const track of tracks) {
            queue.songs.push({
                title: track.info.title,
                url: track.info.uri,
                duration: this.formatDuration(track.info.length / 1000),
                thumbnail: track.info.artworkUrl || '',
                requester: member.user,
                encoded: track.encoded
            });
        }

        if (!queue.playing) {
            this.playNext(guild.id);
        }

        const embed = new EmbedBuilder()
            .setColor('#00ff00');

        if (playlistName) {
            embed.setTitle(`🎵 Added Playlist: ${playlistName}`)
                .setDescription(`Added **${tracks.length}** songs to queue.`);
        } else {
            const song = queue.songs[queue.songs.length - tracks.length]; // Get the first added song
            if (song) {
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
        }

        const reply = { embeds: [embed] };
        isSlash ? interaction.editReply(reply) : interaction.reply(reply);
    }

    async playNext(guildId) {
        const queue = this.getQueue(guildId);

        if (queue.loopMode === 1 && queue.currentSong) {
            // Loop track - do nothing, just replay
        } else {
            if (queue.loopMode === 2 && queue.currentSong) {
                queue.songs.push(queue.currentSong);
            }

            if (queue.songs.length === 0) {
                queue.playing = false;
                queue.currentSong = null;
                // Optional: Leave channel after timeout
                return;
            }

            queue.currentSong = queue.songs.shift();
        }

        queue.playing = true;
        const song = queue.currentSong;

        if (queue.player) {
            await queue.player.playTrack({ track: { encoded: song.encoded } });
            // Shoukaku uses filters for volume control
            await queue.player.setFilters({ volume: queue.volume / 100 });
        }
    }

    async handleSkip(interaction) {
        const isSlash = interaction.isChatInputCommand?.() ?? false;
        const queue = this.getQueue(interaction.guild.id);

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
        const queue = this.getQueue(interaction.guild.id);

        if (queue.player) {
            queue.songs = [];
            queue.playing = false;
            queue.currentSong = null;
            queue.player.stopTrack();
            // shoukaku.leaveVoiceChannel(guildId) if you want to leave
        }

        const reply = '⏹️ Stopped and cleared queue!';
        isSlash ? interaction.reply(reply) : interaction.reply(reply);
    }

    async handlePause(interaction) {
        const isSlash = interaction.isChatInputCommand?.() ?? false;
        const queue = this.getQueue(interaction.guild.id);

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
        const queue = this.getQueue(interaction.guild.id);

        if (queue.player) {
            queue.player.setPaused(false);
            const reply = '▶️ Resumed!';
            isSlash ? interaction.reply(reply) : interaction.reply(reply);
        } else {
            const reply = '❌ Nothing is playing!';
            isSlash ? interaction.reply({ content: reply, ephemeral: true }) : interaction.reply(reply);
        }
    }

    async handleQueue(interaction) {
        const isSlash = interaction.isChatInputCommand?.() ?? false;
        const queue = this.getQueue(interaction.guild.id);

        if (!queue.currentSong && queue.songs.length === 0) {
            const reply = '❌ Queue is empty!';
            return isSlash ? interaction.reply({ content: reply, ephemeral: true }) : interaction.reply(reply);
        }

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('🎶 Music Queue');

        if (queue.currentSong) {
            embed.addFields({ name: 'Now Playing', value: `**${queue.currentSong.title}** | Requested by: ${queue.currentSong.requester}` });
        }

        if (queue.songs.length > 0) {
            const queueList = queue.songs.slice(0, 10).map((song, index) => {
                return `${index + 1}. **${song.title}** (${song.duration})`;
            }).join('\n');

            embed.setDescription(`**Up Next:**\n${queueList}${queue.songs.length > 10 ? `\n...and ${queue.songs.length - 10} more` : ''}`);
        } else {
            embed.setDescription('No more songs in queue.');
        }

        const reply = { embeds: [embed] };
        isSlash ? interaction.reply(reply) : interaction.reply(reply);
    }

    async handleNowPlaying(interaction) {
        const isSlash = interaction.isChatInputCommand?.() ?? false;
        const queue = this.getQueue(interaction.guild.id);

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
        const queue = this.getQueue(interaction.guild.id);

        if (level < 0 || level > 100) {
            const reply = '❌ Volume must be between 0 and 100!';
            return isSlash ? interaction.reply({ content: reply, ephemeral: true }) : interaction.reply(reply);
        }

        queue.volume = level;
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

        const queue = this.getQueue(guild.id);
        if (!queue.player) {
            try {
                const player = await this.shoukaku.joinVoiceChannel({
                    guildId: guild.id,
                    channelId: member.voice.channel.id,
                    shardId: 0
                });

                player.on('start', () => {
                    console.log('Track started');
                });

                player.on('end', () => {
                    this.playNext(guild.id);
                });

                player.on('exception', (err) => {
                    console.error('Track exception:', err);
                    this.playNext(guild.id);
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
        const queue = this.getQueue(interaction.guild.id);

        if (queue.player) {
            queue.songs = [];
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
        const queue = this.getQueue(interaction.guild.id);

        queue.songs = [];
        const reply = '🗑️ Queue cleared!';
        isSlash ? interaction.reply(reply) : interaction.reply(reply);
    }

    async handleShuffle(interaction) {
        const isSlash = interaction.isChatInputCommand?.() ?? false;
        const queue = this.getQueue(interaction.guild.id);

        if (queue.songs.length < 2) {
            const reply = '❌ Not enough songs to shuffle!';
            return isSlash ? interaction.reply({ content: reply, ephemeral: true }) : interaction.reply(reply);
        }

        for (let i = queue.songs.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [queue.songs[i], queue.songs[j]] = [queue.songs[j], queue.songs[i]];
        }

        const reply = '🔀 Queue shuffled!';
        isSlash ? interaction.reply(reply) : interaction.reply(reply);
    }

    async handleLoop(interaction, mode) {
        const isSlash = interaction.isChatInputCommand?.() ?? false;
        const queue = this.getQueue(interaction.guild.id);

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

        const reply = `🔁 Loop mode set to: **${mode}**`;
        isSlash ? interaction.reply(reply) : interaction.reply(reply);
    }

    async handleSeek(interaction, seconds) {
        const isSlash = interaction.isChatInputCommand?.() ?? false;
        const queue = this.getQueue(interaction.guild.id);

        if (!queue.player) {
            const reply = '❌ Nothing is playing!';
            return isSlash ? interaction.reply({ content: reply, ephemeral: true }) : interaction.reply(reply);
        }

        // Shoukaku seek is in milliseconds
        await queue.player.seekTo(seconds * 1000);
        const reply = `⏩ Seeked to ${seconds} seconds!`;
        isSlash ? interaction.reply(reply) : interaction.reply(reply);
    }

    async handleLyrics(interaction, query) {
        const isSlash = interaction.isChatInputCommand?.() ?? false;
        const queue = this.getQueue(interaction.guild.id);

        if (!query && !queue.currentSong) {
            const reply = '❌ Please provide a song name!';
            return isSlash ? interaction.reply({ content: reply, ephemeral: true }) : interaction.reply(reply);
        }

        const searchQuery = query || queue.currentSong.title;

        if (isSlash) await interaction.deferReply();

        try {
            const searches = await this.geniusClient.songs.search(searchQuery);
            const firstSong = searches[0];

            if (!firstSong) {
                const reply = '❌ Lyrics not found!';
                return isSlash ? interaction.editReply(reply) : interaction.reply(reply);
            }

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

    formatDuration(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    start() {
        this.client.login(process.env.DISCORD_TOKEN);
    }
}

// Start the bot
const bot = new MusicBot();
bot.start();