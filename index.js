require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, ActivityType } = require('discord.js');
const { Shoukaku, Connectors } = require('shoukaku');
const SpotifyWebApi = require('spotify-web-api-node');
const Genius = require('genius-lyrics');

const QueueManager = require('./src/QueueManager');
const MusicPlayer = require('./src/MusicPlayer');
const CommandHandler = require('./src/CommandHandler');

const Nodes = [{
    name: 'Localhost',
    url: `${process.env.LAVALINK_HOST || 'localhost'}:2333`,
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

        this.shoukaku = new Shoukaku(new Connectors.DiscordJS(this.client), Nodes);

        // Initialize Spotify API
        this.spotify = new SpotifyWebApi({
            clientId: process.env.SPOTIFY_CLIENT_ID,
            clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
        });

        this.geniusClient = new Genius.Client();

        // Initialize managers
        this.queueManager = new QueueManager();
        this.musicPlayer = new MusicPlayer(this.spotify, this.shoukaku);
        this.commandHandler = new CommandHandler(
            this.queueManager,
            this.musicPlayer,
            this.shoukaku,
            this.spotify,
            this.geniusClient
        );

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
                    case 'queue':
                        await this.commandHandler.handleQueue(interaction);
                        break;
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

        // Prefix command support
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
                        await this.commandHandler.handleQueue(message);
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

    start() {
        this.client.login(process.env.DISCORD_TOKEN);
    }
}

const bot = new MusicBot();
bot.start();