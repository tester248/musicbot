require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, ActivityType, PermissionFlagsBits } = require('discord.js');
const { Shoukaku, Connectors } = require('shoukaku');
const SpotifyWebApi = require('spotify-web-api-node');
const Genius = require('genius-lyrics');

const QueueManager = require('./src/QueueManager');
const MusicPlayer = require('./src/MusicPlayer');
const PlaybackManager = require('./src/PlaybackManager');
const CommandHandler = require('./src/CommandHandler');
const Dashboard = require('./src/Dashboard');
const { JsonStore } = require('./src/storage');

// Catch unhandled rejections and exceptions from Shoukaku internal errors to prevent process crash
process.on('unhandledRejection', (error) => {
    console.error('Unhandled Promise Rejection (Likely Lavalink/Shoukaku internal error):', error);
});
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception (Likely Lavalink/Shoukaku internal error):', error);
});

const Nodes = [
    {
        name: 'Serenetia Secure',
        url: 'lavalinkv4.serenetia.com:443',
        auth: 'https://seretia.link/discord',
        secure: true
    },
    {
        name: 'Serenetia Non-SSL',
        url: 'lavalinkv4.serenetia.com:80',
        auth: 'https://seretia.link/discord',
        secure: false
    },
    {
        name: 'Millohost',
        url: 'lava-v4.millohost.my.id:443',
        auth: 'https://discord.gg/mjS5J2K3ep',
        secure: true
    },
    {
        name: 'TriniumHost Lavalink V4',
        url: 'lavalink-v4.triniumhost.com:443',
        auth: 'free',
        secure: true
    }
];

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

        const stabilityMode = process.env.STABILITY_MODE === 'true';

        this.shoukaku = new Shoukaku(new Connectors.DiscordJS(this.client), Nodes, {
            moveOnDisconnect: true,
            resume: true,
            resumeTimeout: stabilityMode ? 120 : 60,
            reconnectTries: stabilityMode ? 20 : 10,
            reconnectInterval: 5000,
            restTimeout: stabilityMode ? 30000 : 15000,
            voiceConnectionTimeout: stabilityMode ? 40000 : 20000
        });

        // Initialize Spotify API
        this.spotify = new SpotifyWebApi({
            clientId: process.env.SPOTIFY_CLIENT_ID,
            clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
        });

        this.geniusClient = new Genius.Client();

        // Initialize managers
        this.queueManager = new QueueManager();
        this.musicPlayer = new MusicPlayer(this.spotify, this.shoukaku);
        this.playbackManager = new PlaybackManager(
            this.shoukaku,
            this.queueManager,
            this.musicPlayer,
            null
        );
        this.dashboard = new Dashboard(this.client, this.queueManager, this.shoukaku, null, this.playbackManager);

        // JSON persistence stores (guild settings + playlists)
        this.settingsStore = new JsonStore('settings.json');
        this.playlistsStore = new JsonStore('playlists.json');

        this.commandHandler = new CommandHandler(
            this.queueManager,
            this.musicPlayer,
            this.shoukaku,
            this.spotify,
            this.geniusClient,
            this.dashboard,
            this.playbackManager,
            this.settingsStore,
            this.playlistsStore
        );
        this.dashboard.commandHandler = this.commandHandler;

        // Spotify Token Refresh
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
        this.shoukaku.on('debug', (name, info) => console.log(`[shoukaku:debug] ${name}: ${info}`));
        this.shoukaku.on('error', (_, error) => console.error('Shoukaku: Error', error));
        this.shoukaku.on('close', (name, code, reason) => {
            console.warn(`Shoukaku: Closed ${name} ${code} ${reason}`);
            this.playbackManager.onNodeClose(name, code);
        });
        this.shoukaku.on('disconnect', (name, players, moved) => console.warn(`Shoukaku: Disconnected ${name} ${players} ${moved}`));
        this.shoukaku.on('ready', async (name) => {
            console.log(`✅ Shoukaku: Node ${name} is ready`);
            await this.playbackManager.testNode(name);
        });
    }

    setupClient() {

        this.client.on('ready', () => {
            console.log(`✅ Bot is ready! Logged in as ${this.client.user.tag}`);
            this.client.user.setActivity('Music 🎵 | /play', { type: ActivityType.Listening });
            this.registerSlashCommands();
        });

        this.client.on('interactionCreate', async (interaction) => {
            try {
                // ---- Slash commands ----
                if (interaction.isChatInputCommand()) {
                    const command = interaction.commandName;
                    switch (command) {
                        case 'play':
                            await this.commandHandler.handlePlay(interaction, interaction.options.getString('query'));
                            break;
                        case 'skip':
                            await this.commandHandler.handleSkip(interaction);
                            break;
                        case 'stop':
                            await this.commandHandler.handleStop(interaction);
                            break;
                        case 'pause':
                            await this.commandHandler.handlePause(interaction);
                            break;
                        case 'resume':
                            await this.commandHandler.handleResume(interaction);
                            break;
                        case 'queue': {
                            const queueSubcommand = interaction.options.getSubcommand(false);
                            if (queueSubcommand === 'remove') {
                                await this.commandHandler.handleQueue(interaction, 'remove', interaction.options.getInteger('position'));
                            } else if (queueSubcommand === 'move') {
                                await this.commandHandler.handleQueue(interaction, 'move', interaction.options.getInteger('from'), interaction.options.getInteger('to'));
                            } else {
                                // 'show' or no subcommand specified → show the queue
                                await this.commandHandler.handleQueue(interaction, null, interaction.options.getInteger('page'));
                            }
                            break;
                        }
                        case 'nowplaying':
                            await this.commandHandler.handleNowPlaying(interaction);
                            break;
                        case 'volume':
                            await this.commandHandler.handleVolume(interaction, interaction.options.getInteger('level'));
                            break;
                        case 'join':
                            await this.commandHandler.handleJoin(interaction);
                            break;
                        case 'leave':
                            await this.commandHandler.handleLeave(interaction);
                            break;
                        case 'clear':
                            await this.commandHandler.handleClear(interaction);
                            break;
                        case 'shuffle':
                            await this.commandHandler.handleShuffle(interaction);
                            break;
                        case 'loop':
                            await this.commandHandler.handleLoop(interaction, interaction.options.getString('mode'));
                            break;
                        case 'seek':
                            await this.commandHandler.handleSeek(interaction, interaction.options.getInteger('seconds'));
                            break;
                        case 'lyrics':
                            await this.commandHandler.handleLyrics(interaction, interaction.options.getString('query'));
                            break;
                        case 'filter':
                            await this.commandHandler.handleFilter(interaction, interaction.options.getString('mode'), interaction.options.getNumber('value'));
                            break;
                        case 'controller':
                            await this.commandHandler.handleController(interaction, interaction.options.getSubcommand(), interaction.options.getChannel('channel'));
                            break;
                        case 'playlist':
                            await this.commandHandler.handlePlaylist(
                                interaction,
                                interaction.options.getSubcommand(),
                                interaction.options.getString('name'),
                                interaction.options.getString('query'),
                                interaction.options.getInteger('position')
                            );
                            break;
                        case 'help':
                            await this.commandHandler.handleHelp(interaction);
                            break;
                    }
                    return;
                }

                // ---- Interactive components (buttons, select menus) ----
                if (interaction.isMessageComponent()) {
                    await this.commandHandler.handleComponent(interaction);
                    return;
                }

                // ---- Autocomplete ----
                if (interaction.isAutocomplete()) {
                    await this.commandHandler.handleAutocomplete(interaction);
                }
            } catch (error) {
                console.error('Interaction error:', error);
                try {
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: '❌ An error occurred!', ephemeral: true });
                    } else {
                        await interaction.editReply('❌ An error occurred!');
                    }
                } catch {}
            }
        });

        // Prefix command support
        this.client.on('messageCreate', async (message) => {
            if (message.author.bot) return;

            // Controller channel: non-command messages become play requests
            if (await this.commandHandler.handleControllerMessage(message)) return;

            const prefix = process.env.PREFIX || '!';
            if (!message.content.startsWith(prefix)) return;

            const args = message.content.slice(prefix.length).trim().split(/ +/);
            const command = args.shift().toLowerCase();

            try {
                switch (command) {
                    case 'play':
                    case 'p':
                        await this.commandHandler.handlePlay(message, args.join(' '));
                        break;
                    case 'skip':
                    case 's':
                        await this.commandHandler.handleSkip(message);
                        break;
                    case 'stop':
                        await this.commandHandler.handleStop(message);
                        break;
                    case 'pause':
                        await this.commandHandler.handlePause(message);
                        break;
                    case 'resume':
                    case 'r':
                        await this.commandHandler.handleResume(message);
                        break;
                    case 'queue':
                    case 'q':
                        if (args.length > 0) {
                            const subcommand = args[0].toLowerCase();
                            if (subcommand === 'remove' || subcommand === 'rm') {
                                await this.commandHandler.handleQueue(message, 'remove', parseInt(args[1]));
                            } else if (subcommand === 'move' || subcommand === 'mv') {
                                await this.commandHandler.handleQueue(message, 'move', parseInt(args[1]), parseInt(args[2]));
                            } else if (!isNaN(args[0])) {
                                // If first arg is a number, treat it as page number
                                await this.commandHandler.handleQueue(message, null, parseInt(args[0]));
                            } else {
                                await this.commandHandler.handleQueue(message);
                            }
                        } else {
                            await this.commandHandler.handleQueue(message);
                        }
                        break;
                    case 'nowplaying':
                    case 'np':
                        await this.commandHandler.handleNowPlaying(message);
                        break;
                    case 'volume':
                    case 'vol':
                    case 'v':
                        await this.commandHandler.handleVolume(message, parseInt(args[0]));
                        break;
                    case 'join':
                    case 'j':
                        await this.commandHandler.handleJoin(message);
                        break;
                    case 'leave':
                    case 'l':
                    case 'dc':
                        await this.commandHandler.handleLeave(message);
                        break;
                    case 'clear':
                    case 'c':
                        await this.commandHandler.handleClear(message);
                        break;
                    case 'shuffle':
                        await this.commandHandler.handleShuffle(message);
                        break;
                    case 'loop':
                        await this.commandHandler.handleLoop(message, args[0]);
                        break;
                    case 'seek':
                        await this.commandHandler.handleSeek(message, parseInt(args[0]));
                        break;
                    case 'lyrics':
                    case 'ly':
                        await this.commandHandler.handleLyrics(message, args.join(' '));
                        break;
                    case 'filter':
                        await this.commandHandler.handleFilter(message, args[0], parseFloat(args[1]));
                        break;
                    case 'controller':
                        await this.commandHandler.handleController(message, args[0], message.mentions.channels.first());
                        break;
                    case 'playlist':
                    case 'pl': {
                        const [act, ...rest] = args;
                        await this.commandHandler.handlePlaylist(
                            message,
                            act ? act.toLowerCase() : 'list',
                            rest[0],
                            rest.slice(1).join(' '),
                            parseInt(rest[1])
                        );
                        break;
                    }
                    case 'help':
                    case 'h':
                        await this.commandHandler.handleHelp(message);
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
                        .setRequired(true)
                        .setAutocomplete(true)),
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
                .setDescription('Manage the music queue')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('show')
                        .setDescription('Show the current queue')
                        .addIntegerOption(option =>
                            option.setName('page')
                                .setDescription('Page number to display')
                                .setRequired(false)
                                .setMinValue(1)))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('remove')
                        .setDescription('Remove a song from the queue')
                        .addIntegerOption(option =>
                            option.setName('position')
                                .setDescription('Position of the song to remove')
                                .setRequired(true)
                                .setMinValue(1)))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('move')
                        .setDescription('Move a song in the queue')
                        .addIntegerOption(option =>
                            option.setName('from')
                                .setDescription('Current position of the song')
                                .setRequired(true)
                                .setMinValue(1))
                        .addIntegerOption(option =>
                            option.setName('to')
                                .setDescription('New position for the song')
                                .setRequired(true)
                                .setMinValue(1))),
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
                        .setRequired(false)),
            new SlashCommandBuilder()
                .setName('playlist')
                .setDescription('Manage your saved playlists')
                .addSubcommand(sc => sc.setName('create').setDescription('Create a playlist').addStringOption(o => o.setName('name').setDescription('Playlist name').setRequired(true)))
                .addSubcommand(sc => sc.setName('delete').setDescription('Delete a playlist').addStringOption(o => o.setName('name').setDescription('Playlist name').setRequired(true)))
                .addSubcommand(sc => sc.setName('list').setDescription('List your playlists'))
                .addSubcommand(sc => sc.setName('view').setDescription('View a playlist').addStringOption(o => o.setName('name').setDescription('Playlist name').setRequired(true)))
                .addSubcommand(sc => sc.setName('add').setDescription('Add a song to a playlist').addStringOption(o => o.setName('name').setDescription('Playlist name').setRequired(true)).addStringOption(o => o.setName('query').setDescription('Song name or URL').setRequired(true)))
                .addSubcommand(sc => sc.setName('remove').setDescription('Remove a song from a playlist').addStringOption(o => o.setName('name').setDescription('Playlist name').setRequired(true)).addIntegerOption(o => o.setName('position').setDescription('Track number').setRequired(true).setMinValue(1)))
                .addSubcommand(sc => sc.setName('play').setDescription('Play a saved playlist').addStringOption(o => o.setName('name').setDescription('Playlist name').setRequired(true))),
            new SlashCommandBuilder()
                .setName('controller')
                .setDescription('Manage the controller channel')
                .addSubcommand(sc => sc.setName('setup').setDescription('Set the controller channel').addChannelOption(o => o.setName('channel').setDescription('Text channel').setRequired(true)))
                .addSubcommand(sc => sc.setName('disable').setDescription('Disable the controller channel'))
                .addSubcommand(sc => sc.setName('view').setDescription('Show the current controller channel')),
            new SlashCommandBuilder()
                .setName('filter')
                .setDescription('Apply an audio filter')
                .addStringOption(o => o.setName('mode').setDescription('Filter').setRequired(true)
                    .addChoices(
                        { name: 'Bassboost', value: 'bassboost' },
                        { name: 'Nightcore', value: 'nightcore' },
                        { name: '8D', value: '8d' },
                        { name: 'Karaoke', value: 'karaoke' },
                        { name: 'Vibrato', value: 'vibrato' },
                        { name: 'Speed', value: 'speed' },
                        { name: 'Pitch', value: 'pitch' },
                        { name: 'Reset', value: 'reset' }))
                .addNumberOption(o => o.setName('value').setDescription('Value (for speed/pitch)').setRequired(false)),
            new SlashCommandBuilder()
                .setName('help')
                .setDescription('Show available commands')
        ];

        try {
            console.log('🔄 Registering slash commands...');
            const devGuildId = process.env.DEV_GUILD_ID;
            let target = null;

            if (devGuildId) {
                target = await this.client.guilds.fetch(devGuildId);
            } else {
                // Auto-detect a guild the bot can manage (for dev/debugging so
                // command updates apply instantly without manual server IDs).
                target = this.client.guilds.cache.find(g => g.members.me?.permissions?.has(PermissionFlagsBits.ManageGuild)) || null;
            }

            // ---- Cleanup: remove stale registrations so there's exactly one
            // set of commands (global + every guild except the dev target).
            // This clears duplicates that accumulated from earlier global and
            // multi-guild dev registrations.
            try {
                await this.client.application.commands.set([]);
                const clients = this.client.guilds.cache.filter(g => !target || g.id !== target.id);
                for (const [, g] of clients) {
                    try { await g.commands.set([]); } catch {}
                }
            } catch (cleanupErr) {
                console.error('Slash cleanup warning:', cleanupErr.message);
            }

            // ---- Register fresh to the target (dev guild, or auto-detected one)
            if (target) {
                await target.commands.set(commands);
                console.log(`✅ Slash commands registered to guild ${target.name}!`);
            } else {
                await this.client.application.commands.set(commands);
                console.log('✅ Slash commands registered globally!');
            }
        } catch (error) {
            console.error('Error registering slash commands:', error);
        }
    }

    start() {
        this.client.login(process.env.DISCORD_TOKEN);
        this.dashboard.start();
    }
}

const bot = new MusicBot();
bot.start();