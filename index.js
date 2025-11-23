const { Client, GatewayIntentBits, Collection, EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
const play = require('play-dl');
const { Innertube, UniversalCache } = require('youtubei.js');
const ytdl = require('@distube/ytdl-core');
const SpotifyWebApi = require('spotify-web-api-node');
const Genius = require("genius-lyrics");
const GeniusClient = new Genius.Client();
const fs = require('fs');
const sodium = require('libsodium-wrappers');
require('dotenv').config();

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
        this.connections = new Collection();
        this.players = new Collection();
        this.youtube = null;

        // Initialize Spotify API
        this.spotify = new SpotifyWebApi({
            clientId: process.env.SPOTIFY_CLIENT_ID,
            clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
        });

        // Set access token for Spotify (client credentials flow)
        this.initializeSpotify();

        // Load cookies for YouTube
        this.loadCookies();

        this.setupEvents();
        this.setupCommands();
    }

    async initializeSpotify() {
        try {
            if (process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET) {
                const data = await this.spotify.clientCredentialsGrant();
                this.spotify.setAccessToken(data.body['access_token']);
                console.log('✅ Spotify API initialized');
            }
        } catch (error) {
            console.error('Failed to initialize Spotify API:', error);
        }
    }

    loadCookies() {
        try {
            if (fs.existsSync('./cookies.txt')) {
                const cookieData = fs.readFileSync('./cookies.txt', 'utf8');
                
                try {
                    // Try parsing as JSON first (new format)
                    const cookieArray = JSON.parse(cookieData);
                    if (Array.isArray(cookieArray)) {
                        // Store both formats for different libraries
                        this.cookieString = cookieArray.map(c => `${c.name}=${c.value}`).join('; ');
                        this.cookieArray = cookieArray; // For new ytdl-core format
                        console.log('✅ Loaded YouTube cookies (JSON format)');
                    }
                } catch (parseError) {
                    // Fallback to old string format
                    this.cookieString = cookieData.trim();
                    console.log('✅ Loaded YouTube cookies (string format)');
                }
            }
        } catch (error) {
            console.error('Failed to load cookies:', error);
        }
    }

    setupEvents() {
        this.client.once('ready', () => {
            console.log(`✅ Bot is ready! Logged in as ${this.client.user.tag}`);
            this.registerSlashCommands();
        });

        this.client.on('interactionCreate', async (interaction) => {
            if (!interaction.isChatInputCommand()) return;

            try {
                switch (interaction.commandName) {
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
                console.error('Slash command error:', error);
                const reply = { content: '❌ An error occurred while executing the command.', ephemeral: true };
                if (interaction.replied) {
                    interaction.followUp(reply);
                } else {
                    interaction.reply(reply);
                }
            }
        });
    }

    async setupCommands() {
        // Commands are registered in registerSlashCommands()
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
                playing: false,
                currentSong: null,
                loopMode: 0, // 0: Off, 1: Track, 2: Queue
                volume: parseInt(process.env.DEFAULT_VOLUME) || 50
            });
        }
        return this.queues.get(guildId);
    }

    async searchSong(query) {
        try {
            // Check if it's a Spotify URL
            if (query.includes('spotify.com')) {
                return await this.handleSpotifyUrl(query);
            }

            // Check if it's a YouTube URL
            if (query.includes('youtube.com') || query.includes('youtu.be')) {
                const info = await play.video_info(query);
                return {
                    title: info.video_details.title,
                    url: info.video_details.url,
                    duration: this.formatDuration(info.video_details.durationInSec),
                    thumbnail: info.video_details.thumbnails[0]?.url,
                    uploader: info.video_details.channel?.name
                };
            }

            // Search YouTube
            const searched = await play.search(query, { limit: 1 });
            if (searched.length === 0) return null;

            const video = searched[0];
            return {
                title: video.title,
                url: video.url,
                duration: this.formatDuration(video.durationInSec),
                thumbnail: video.thumbnails[0]?.url,
                uploader: video.channel?.name
            };
        } catch (error) {
            console.error('Search error:', error);
            return null;
        }
    }

    async handleSpotifyUrl(url) {
        try {
            const trackId = url.match(/track\/([a-zA-Z0-9]+)/)?.[1];
            if (!trackId) return null;

            const track = await this.spotify.getTrack(trackId);
            const searchQuery = `${track.body.artists[0].name} ${track.body.name}`;
            
            // Search for the track on YouTube
            const searched = await play.search(searchQuery, { limit: 1 });
            if (searched.length === 0) return null;

            const video = searched[0];
            return {
                title: `${track.body.artists[0].name} - ${track.body.name}`,
                url: video.url,
                duration: this.formatDuration(video.durationInSec),
                thumbnail: track.body.album.images[0]?.url,
                uploader: track.body.artists[0].name,
                spotify: true
            };
        } catch (error) {
            console.error('Spotify error:', error);
            return null;
        }
    }

    async handlePlay(interaction, query) {
        const isSlash = interaction.isChatInputCommand();
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

        const msg = isSlash ? await interaction.deferReply() : null;

        const song = await this.searchSong(query);
        if (!song) {
            const reply = '❌ Could not find that song!';
            return isSlash ? interaction.editReply(reply) : interaction.reply(reply);
        }

        const queue = this.getQueue(guild.id);
        song.requester = member.user;

        // Join voice channel if not connected
        if (!this.connections.has(guild.id)) {
            const connection = joinVoiceChannel({
                channelId: member.voice.channel.id,
                guildId: guild.id,
                adapterCreator: guild.voiceAdapterCreator,
            });

            this.connections.set(guild.id, connection);
            
            const player = createAudioPlayer();
            this.players.set(guild.id, player);
            
            connection.subscribe(player);

            player.on(AudioPlayerStatus.Idle, () => {
                this.playNext(guild.id);
            });

            player.on('error', error => {
                console.error('Player error:', error);
                const queue = this.getQueue(guild.id);
                if (queue.currentSong && error.message && error.message.includes('Sign in')) {
                    console.log('🔄 Retrying with different streaming method...');
                    this.playStreamWithRetry(guild.id, queue.currentSong, 0, 1);
                } else {
                    this.playNext(guild.id);
                }
            });
        }

        queue.songs.push(song);

        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('🎵 Added to Queue')
            .setDescription(`**${song.title}**`)
            .addFields(
                { name: 'Duration', value: song.duration, inline: true },
                { name: 'Position', value: `${queue.songs.length}`, inline: true },
                { name: 'Requested by', value: song.requester.toString(), inline: true }
            )
            .setThumbnail(song.thumbnail);

        if (!queue.playing) {
            this.playNext(guild.id);
        }

        const reply = { embeds: [embed] };
        isSlash ? interaction.editReply(reply) : interaction.reply(reply);
    }

    async playNext(guildId) {
        const queue = this.getQueue(guildId);
        const player = this.players.get(guildId);

        // Handle Loop Track
        if (queue.loopMode === 1 && queue.currentSong) {
            // Keep current song
        } else {
            // Handle Loop Queue
            if (queue.loopMode === 2 && queue.currentSong) {
                queue.songs.push(queue.currentSong);
            }

            if (queue.songs.length === 0) {
                queue.playing = false;
                queue.currentSong = null;
                return;
            }

            const song = queue.songs.shift();
            queue.currentSong = song;
        }

        queue.playing = true;
        const song = queue.currentSong;

        await this.playStreamWithRetry(guildId, song, 0);
    }

    async handleSkip(interaction) {
        const isSlash = interaction.isChatInputCommand();
        const guild = interaction.guild;
        const player = this.players.get(guild.id);

        if (!player) {
            const reply = '❌ Nothing is playing!';
            return isSlash ? interaction.reply({ content: reply, ephemeral: true }) : interaction.reply(reply);
        }

        player.stop();
        const reply = '⏭️ Skipped!';
        isSlash ? interaction.reply(reply) : interaction.reply(reply);
    }

    async handleStop(interaction) {
        const isSlash = interaction.isChatInputCommand();
        const guild = interaction.guild;
        const queue = this.getQueue(guild.id);
        const player = this.players.get(guild.id);

        if (!player) {
            const reply = '❌ Nothing is playing!';
            return isSlash ? interaction.reply({ content: reply, ephemeral: true }) : interaction.reply(reply);
        }

        queue.songs = [];
        queue.playing = false;
        queue.currentSong = null;
        player.stop();

        const reply = '⏹️ Stopped and cleared queue!';
        isSlash ? interaction.reply(reply) : interaction.reply(reply);
    }

    async handlePause(interaction) {
        const isSlash = interaction.isChatInputCommand();
        const guild = interaction.guild;
        const player = this.players.get(guild.id);

        if (!player) {
            const reply = '❌ Nothing is playing!';
            return isSlash ? interaction.reply({ content: reply, ephemeral: true }) : interaction.reply(reply);
        }

        player.pause();
        const reply = '⏸️ Paused!';
        isSlash ? interaction.reply(reply) : interaction.reply(reply);
    }

    async handleResume(interaction) {
        const isSlash = interaction.isChatInputCommand();
        const guild = interaction.guild;
        const player = this.players.get(guild.id);

        if (!player) {
            const reply = '❌ Nothing is playing!';
            return isSlash ? interaction.reply({ content: reply, ephemeral: true }) : interaction.reply(reply);
        }

        player.unpause();
        const reply = '▶️ Resumed!';
        isSlash ? interaction.reply(reply) : interaction.reply(reply);
    }

    async handleQueue(interaction) {
        const isSlash = interaction.isChatInputCommand();
        const guild = interaction.guild;
        const queue = this.getQueue(guild.id);

        if (!queue.currentSong && queue.songs.length === 0) {
            const reply = '❌ Queue is empty!';
            return isSlash ? interaction.reply({ content: reply, ephemeral: true }) : interaction.reply(reply);
        }

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('🎵 Music Queue');

        if (queue.currentSong) {
            embed.addFields({
                name: 'Now Playing',
                value: `**${queue.currentSong.title}** - ${queue.currentSong.requester}`,
                inline: false
            });
        }

        if (queue.songs.length > 0) {
            const upcoming = queue.songs.slice(0, 10).map((song, index) => 
                `${index + 1}. **${song.title}** - ${song.requester}`
            ).join('\n');

            embed.addFields({
                name: 'Up Next',
                value: upcoming,
                inline: false
            });

            if (queue.songs.length > 10) {
                embed.setFooter({ text: `...and ${queue.songs.length - 10} more songs` });
            }
        }

        const reply = { embeds: [embed] };
        isSlash ? interaction.reply(reply) : interaction.reply(reply);
    }

    async handleNowPlaying(interaction) {
        const isSlash = interaction.isChatInputCommand();
        const guild = interaction.guild;
        const queue = this.getQueue(guild.id);

        if (!queue.currentSong) {
            const reply = '❌ Nothing is playing!';
            return isSlash ? interaction.reply({ content: reply, ephemeral: true }) : interaction.reply(reply);
        }

        const song = queue.currentSong;
        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('🎵 Now Playing')
            .setDescription(`**${song.title}**`)
            .addFields(
                { name: 'Duration', value: song.duration, inline: true },
                { name: 'Requested by', value: song.requester.toString(), inline: true }
            )
            .setThumbnail(song.thumbnail);

        if (song.uploader) {
            embed.addFields({ name: 'Uploader', value: song.uploader, inline: true });
        }

        const reply = { embeds: [embed] };
        isSlash ? interaction.reply(reply) : interaction.reply(reply);
    }

    async handleVolume(interaction, level) {
        const isSlash = interaction.isChatInputCommand();
        const guild = interaction.guild;
        const queue = this.getQueue(guild.id);
        const player = this.players.get(guild.id);

        if (level === undefined || level === null) {
            const reply = `🔊 Current volume: ${queue.volume}%`;
            return isSlash ? interaction.reply(reply) : interaction.reply(reply);
        }

        if (level < 0 || level > 100) {
            const reply = '❌ Volume must be between 0 and 100!';
            return isSlash ? interaction.reply({ content: reply, ephemeral: true }) : interaction.reply(reply);
        }

        queue.volume = level;

        if (player && player.state.resource && player.state.resource.volume) {
            player.state.resource.volume.setVolume(level / 100);
        }

        const reply = `🔊 Volume set to ${level}%`;
        isSlash ? interaction.reply(reply) : interaction.reply(reply);
    }

    async handleJoin(interaction) {
        const isSlash = interaction.isChatInputCommand();
        const member = interaction.member;
        const guild = interaction.guild;

        if (!member.voice.channel) {
            const reply = '❌ You need to be in a voice channel!';
            return isSlash ? interaction.reply({ content: reply, ephemeral: true }) : interaction.reply(reply);
        }

        const connection = joinVoiceChannel({
            channelId: member.voice.channel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
        });

        this.connections.set(guild.id, connection);
        
        const player = createAudioPlayer();
        this.players.set(guild.id, player);
        connection.subscribe(player);

        const reply = `✅ Joined ${member.voice.channel.name}`;
        isSlash ? interaction.reply(reply) : interaction.reply(reply);
    }

    async handleLeave(interaction) {
        const isSlash = interaction.isChatInputCommand();
        const guild = interaction.guild;
        const connection = this.connections.get(guild.id);

        if (!connection) {
            const reply = '❌ Not connected to a voice channel!';
            return isSlash ? interaction.reply({ content: reply, ephemeral: true }) : interaction.reply(reply);
        }

        connection.destroy();
        this.connections.delete(guild.id);
        this.players.delete(guild.id);
        this.queues.delete(guild.id);

        const reply = '👋 Left the voice channel!';
        isSlash ? interaction.reply(reply) : interaction.reply(reply);
    }

    async handleClear(interaction) {
        const isSlash = interaction.isChatInputCommand();
        const guild = interaction.guild;
        const queue = this.getQueue(guild.id);

        queue.songs = [];
        const reply = '🗑️ Queue cleared!';
        isSlash ? interaction.reply(reply) : interaction.reply(reply);
    }

    async handleShuffle(interaction) {
        const isSlash = interaction.isChatInputCommand();
        const guild = interaction.guild;
        const queue = this.getQueue(guild.id);

        if (queue.songs.length === 0) {
            const reply = '❌ Queue is empty!';
            return isSlash ? interaction.reply({ content: reply, ephemeral: true }) : interaction.reply(reply);
        }

        // Fisher-Yates shuffle
        for (let i = queue.songs.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [queue.songs[i], queue.songs[j]] = [queue.songs[j], queue.songs[i]];
        }

        const reply = '🔀 Queue shuffled!';
        isSlash ? interaction.reply(reply) : interaction.reply(reply);
    }

    async handleLoop(interaction, mode) {
        const isSlash = interaction.isChatInputCommand();
        const guild = interaction.guild;
        const queue = this.getQueue(guild.id);

        if (!mode) {
            const modes = ['Off', 'Track', 'Queue'];
            const reply = `🔁 Current loop mode: **${modes[queue.loopMode]}**`;
            return isSlash ? interaction.reply(reply) : interaction.reply(reply);
        }

        switch (mode.toLowerCase()) {
            case 'off':
                queue.loopMode = 0;
                break;
            case 'track':
            case 'song':
                queue.loopMode = 1;
                break;
            case 'queue':
                queue.loopMode = 2;
                break;
            default: {
                const reply = '❌ Invalid mode! Use: off, track, queue';
                return isSlash ? interaction.reply({ content: reply, ephemeral: true }) : interaction.reply(reply);
            }
        }

        const modes = ['Off', 'Track', 'Queue'];
        const reply = `🔁 Loop mode set to: **${modes[queue.loopMode]}**`;
        isSlash ? interaction.reply(reply) : interaction.reply(reply);
    }

    async handleSeek(interaction, seconds) {
        const isSlash = interaction.isChatInputCommand();
        const guild = interaction.guild;
        const queue = this.getQueue(guild.id);
        const player = this.players.get(guild.id);

        if (!queue.currentSong) {
            const reply = '❌ Nothing is playing!';
            return isSlash ? interaction.reply({ content: reply, ephemeral: true }) : interaction.reply(reply);
        }

        if (!seconds && seconds !== 0) {
             const reply = '❌ Please provide time in seconds!';
             return isSlash ? interaction.reply({ content: reply, ephemeral: true }) : interaction.reply(reply);
        }
        
        seconds = parseInt(seconds);

        await this.playStreamWithRetry(guild.id, queue.currentSong, seconds);
        
        const reply = `⏩ Seeked to ${this.formatDuration(seconds)}!`;
        isSlash ? interaction.reply(reply) : interaction.reply(reply);
    }

    async handleLyrics(interaction, query) {
        const isSlash = interaction.isChatInputCommand();
        const guild = interaction.guild;
        const queue = this.getQueue(guild.id);

        if (!query && queue.currentSong) {
            // Clean up title for better search results (remove (Official Video) etc)
            query = queue.currentSong.title.replace(/[([].*?(official|video|audio|lyrics|lyric).*?[)\]]/gi, '').trim();
        }

        if (!query) {
            const reply = '❌ Please provide a song name or play a song!';
            return isSlash ? interaction.reply({ content: reply, ephemeral: true }) : interaction.reply(reply);
        }

        if (isSlash) await interaction.deferReply();

        try {
            const searches = await GeniusClient.songs.search(query);
            
            if (searches.length === 0) {
                const reply = '❌ No lyrics found!';
                return isSlash ? interaction.editReply(reply) : interaction.reply(reply);
            }

            const song = searches[0];
            const lyrics = await song.lyrics();
            
            if (!lyrics) {
                 const reply = '❌ No lyrics found!';
                 return isSlash ? interaction.editReply(reply) : interaction.reply(reply);
            }

            const embed = new EmbedBuilder()
                .setTitle(`Lyrics for ${song.title}`)
                .setURL(song.url)
                .setThumbnail(song.thumbnail)
                .setColor('#FFFF00')
                .setDescription(lyrics.length > 4096 ? lyrics.substring(0, 4093) + '...' : lyrics)
                .setFooter({ text: `Lyrics provided by Genius` });
                
            const reply = { embeds: [embed] };
            isSlash ? interaction.editReply(reply) : interaction.reply(reply);

        } catch (error) {
            console.error('Lyrics error:', error);
            const reply = '❌ Error fetching lyrics!';
            isSlash ? interaction.editReply(reply) : interaction.reply(reply);
        }
    }

    async playStreamWithRetry(guildId, song, seek = 0, retryCount = 0) {
        const maxRetries = 3;
        const baseDelay = 1000; // 1 second

        try {
            await this.playStream(guildId, song, seek);
        } catch (error) {
            console.error(`Play stream error (attempt ${retryCount + 1}):`, error);
            
            if (retryCount < maxRetries) {
                const delay = baseDelay * Math.pow(2, retryCount); // Exponential backoff
                console.log(`🔄 Retrying in ${delay}ms... (${retryCount + 1}/${maxRetries})`);
                
                setTimeout(() => {
                    this.playStreamWithRetry(guildId, song, seek, retryCount + 1);
                }, delay);
            } else {
                console.error('❌ All retry attempts failed, skipping to next song');
                if (seek === 0) this.playNext(guildId);
            }
        }
    }

    async playStream(guildId, song, seek = 0) {
        const queue = this.getQueue(guildId);
        const player = this.players.get(guildId);

        if (!song || !song.url) {
            console.error('Invalid song object:', song);
            this.playNext(guildId);
            return;
        }

        console.log(`Attempting to play: ${song.title} (${song.url})`);

        let stream = null;
        let inputType = undefined;

        // Primary: play-dl
        try {
            const pdlStream = await play.stream(song.url, { seek: seek });
            stream = pdlStream.stream;
            inputType = pdlStream.type;
            console.log('Using play-dl stream');
        } catch (pErr) {
            console.warn('play-dl failed:', pErr?.message || pErr);

            // Fallback 1: youtubei (Innertube) - prioritized for better bot detection resistance
            if (this.youtube) {
                try {
                    const match = song.url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
                    const videoId = match ? match[1] : null;
                    if (!videoId) throw new Error('Could not extract video id');

                    const info = await this.youtube.getBasicInfo(videoId);
                    console.log('youtubei.getBasicInfo keys:', Object.keys(info));
                    const formatsList = info.formats || info.streaming_data?.formats || info.streamingData?.formats || [];
                    console.log('youtubei formats count:', formatsList.length);

                    // Prefer direct URL formats
                    const usableFormat = Array.isArray(formatsList) ? formatsList.find(f => typeof f.url === 'string' && f.url.length) : undefined;
                    if (usableFormat) {
                        stream = usableFormat.url;
                        console.log('Using direct format.url from youtubei');
                    }

                    // server_abr_streaming_url fallback
                    if (!stream && info.streaming_data && info.streaming_data.server_abr_streaming_url) {
                        stream = info.streaming_data.server_abr_streaming_url;
                        console.log('Using server_abr_streaming_url fallback from youtubei');
                    }

                    // Try chooseFormat->decipher if still no stream
                    if (!stream) {
                        const chosen = info.chooseFormat ? info.chooseFormat({ type: 'audio', quality: 'best' }) : null;
                        if (chosen) {
                            try {
                                const deciphered = chosen.url || (typeof chosen.decipher === 'function' ? chosen.decipher(this.youtube.session?.player) : undefined);
                                if (deciphered) {
                                    stream = deciphered;
                                    console.log('Using deciphered url from youtubei chosen format');
                                }
                            } catch (decErr) {
                                console.warn('youtubei chosen format decipher failed:', decErr?.message || decErr);
                            }
                        }
                    }

                    // Finally attempt download() if still nothing
                    if (!stream) {
                        try {
                            const downloadStream = await this.youtube.download(videoId, { type: 'audio', quality: 'best', format: 'mp4' });
                            stream = downloadStream;
                            console.log('Using youtubei.download stream');
                        } catch (dlErr) {
                            console.warn('youtubei.download failed:', dlErr?.message || dlErr);
                        }
                    }
                } catch (yiErr) {
                    console.warn('youtubei fallback failed:', yiErr?.message || yiErr);
                }
            }

            // Fallback 2: ytdl-core (@distube/ytdl-core) - last resort
            if (!stream) {
                try {
                    const ytdlOptions = {
                        filter: 'audioonly',
                        highWaterMark: 1 << 25,
                        dlChunkSize: 0
                    };

                    // Use new cookie format for ytdl-core
                    if (this.cookieArray) {
                        ytdlOptions.cookies = this.cookieArray;
                    } else if (this.cookieString) {
                        ytdlOptions.requestOptions = { headers: { Cookie: this.cookieString } };
                    }

                    stream = ytdl(song.url, ytdlOptions);
                    console.log('Using @distube/ytdl-core final fallback stream');
                } catch (yErr) {
                    console.warn('ytdl-core final fallback failed:', yErr?.message || yErr);
                }
            }
        }

        // If still no stream available, nothing we can do
        if (!stream) {
            console.error('All stream fallbacks failed — skipping track');
            if (seek === 0) this.playNext(guildId);
            return;
        }

        try {
            const resource = createAudioResource(stream, { inputType: inputType, inlineVolume: true });
            resource.volume.setVolume(queue.volume / 100);
            player.play(resource);

            if (seek === 0) console.log(`🎵 Now playing: ${song.title}`);
        } catch (error) {
            console.error('Play error when creating resource or playing:', error);
            
            // If it's a "Sign in" error, the cookies might be invalid
            if (error.message && error.message.includes('Sign in')) {
                console.error('⚠️  YouTube is requiring sign-in. Your cookies might be expired or invalid.');
                console.log('💡 Try updating your cookies.txt file with fresh YouTube cookies.');
            }
            
            if (seek === 0) this.playNext(guildId);
        }
    }

    formatDuration(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    async start() {
        await sodium.ready;
        
        try {
            this.youtube = await Innertube.create({
                cache: new UniversalCache(false),
                cookie: this.cookieString,
                generate_session_locally: true
            });
            console.log('✅ YouTube.js (Innertube) initialized');
        } catch (error) {
            console.error('Failed to initialize YouTube.js:', error);
        }

        this.client.login(process.env.DISCORD_TOKEN);
    }
}

// Initialize and start the bot
const bot = new MusicBot();
bot.start();

console.log('🚀 Starting Discord Music Bot...');