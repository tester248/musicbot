const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

class Dashboard {
    constructor(client, queueManager, shoukaku, commandHandler = null, playbackManager = null) {
        this.client = client;
        this.queueManager = queueManager;
        this.shoukaku = shoukaku;
        this.commandHandler = commandHandler;
        this.playbackManager = playbackManager;
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = new Server(this.server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });
        // Use DASHBOARD_PORT, or PORT (if it's not 2333), or fallback to 3000
        this.port = process.env.DASHBOARD_PORT || (process.env.PORT && process.env.PORT !== '2333' ? process.env.PORT : 3000);

        this.setupExpress();
        this.setupSockets();
    }

    setupExpress() {
        this.app.use(express.static(path.join(__dirname, '../public')));
        this.app.use(express.json());

        this.app.get('/api/stats', (req, res) => {
            res.json(this.getStats());
        });

        // ---- Web Player ----

        // GET /api/player?guildId=...  → current player state
        this.app.get('/api/player', (req, res) => {
            const guildId = req.query.guildId;
            if (!guildId) return res.status(400).json({ error: 'guildId required' });
            res.json(this.getPlayerState(guildId));
        });

        // POST /api/player/search  { guildId, query } → search results
        this.app.post('/api/player/search', async (req, res) => {
            const { guildId, query } = req.body || {};
            if (!guildId || !query) return res.status(400).json({ error: 'guildId and query required' });
            try {
                const node = this.playbackManager ? this.playbackManager.getWorkingNode() : null;
                if (!node) return res.status(503).json({ error: 'No node available' });
                const result = await node.rest.resolve('ytsearch:' + query);
                const tracks = (result && result.loadType === 'search' && Array.isArray(result.data)) ? result.data : [];
                res.json({ tracks: tracks.slice(0, 12).map(t => ({
                    title: t.info.title,
                    author: t.info.author || '',
                    duration: t.info.length || 0,
                    uri: t.info.uri || '',
                    thumbnail: t.info.artworkUrl || '',
                    encoded: t.encoded
                })) });
            } catch (e) {
                console.error('Search API error:', e);
                res.status(500).json({ error: 'Search failed' });
            }
        });

        // POST /api/player/join  { guildId } → bot joins the voice channel with members in it
        this.app.post('/api/player/join', async (req, res) => {
            const { guildId } = req.body || {};
            if (!guildId) return res.status(400).json({ error: 'guildId required' });
            try {
                await this.joinRemote(guildId);
                res.json({ ok: true });
            } catch (e) {
                console.error('Join API error:', e);
                res.status(500).json({ error: e.message });
            }
        });

        // POST /api/player/play  { guildId, channelId, query } → play a song
        this.app.post('/api/player/play', async (req, res) => {
            const { guildId, channelId, query } = req.body || {};
            if (!guildId || !query) return res.status(400).json({ error: 'guildId and query required' });
            try {
                await this.playRemote(guildId, channelId, query);
                res.json({ ok: true });
            } catch (e) {
                console.error('Play API error:', e);
                res.status(500).json({ error: e.message });
            }
        });




    }

    setupSockets() {
        this.io.on('connection', (socket) => {
            console.log('Dashboard client connected');
            socket.emit('stats', this.getStats());

            socket.on('player:action', async ({ guildId, action, value }) => {
                try {
                    const ok = await this.playerAction(guildId, action, value);
                    // Broadcast fresh state after any action
                    this.io.emit('player:state', this.getPlayerState(guildId));
                    this.io.emit('stats', this.getStats());
                    socket.emit('player:result', { ok, action });
                } catch (e) {
                    console.error('player action error:', e);
                    socket.emit('player:result', { ok: false, error: e.message });
                }
            });

            socket.on('player:search', async ({ guildId, query }) => {
                try {
                    const node = this.playbackManager ? this.playbackManager.getWorkingNode() : null;
                    if (!node) return socket.emit('player:search-results', { tracks: [] });
                    const result = await node.rest.resolve('ytsearch:' + query);
                    const tracks = (result && result.loadType === 'search' && Array.isArray(result.data)) ? result.data : [];
                    socket.emit('player:search-results', { tracks: tracks.slice(0, 12).map(t => ({
                        title: t.info.title,
                        author: t.info.author || '',
                        duration: t.info.length || 0,
                        uri: t.info.uri || '',
                        thumbnail: t.info.artworkUrl || '',
                        encoded: t.encoded
                    })) });
                } catch (e) {
                    socket.emit('player:search-results', { tracks: [] });
                }
            });

            socket.on('disconnect', () => {
                console.log('Dashboard client disconnected');
            });
        });

        // Periodic updates
        setInterval(() => {
            this.io.emit('stats', this.getStats());
        }, 5000);
    }

    // ---- Web Player logic ----

    getPlayerState(guildId) {
        const q = this.queueManager.getQueue(guildId);
        const guild = this.client.guilds.cache.get(guildId);
        if (!q || !q.player) {
            return { guildId, active: false, nowPlaying: null, queue: [], paused: false, volume: q ? q.volume : 100, guildName: guild ? guild.name : 'Unknown' };
        }
        const song = q.currentSong;
        return {
            guildId,
            active: q.playing,
            guildName: guild ? guild.name : 'Unknown',
            nowPlaying: song ? {
                title: song.title,
                thumbnail: song.thumbnail,
                requester: song.requester.username,
                duration: song.duration
            } : null,
            queue: q.songs.map((s, i) => ({ index: i, title: s.title, duration: s.duration, requester: s.requester.username })),
            paused: !!q.player.paused,
            position: q.player.position || 0,
            durationMs: q.player.track?.info?.length || 0,
            volume: q.volume,
            loopMode: q.loopMode
        };
    }

    async playRemote(guildId, channelId, query) {
        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) throw new Error('Guild not found');

        // Resolve target voice channel: provided one > bot's current VC > first member VC
        let channel = guild.channels.cache.get(channelId);
        if (!channel || !channel.isVoiceBased()) {
            const botVcId = guild.members?.me?.voice?.channelId;
            const memberVcId = guild.voiceStates.cache.find(v => !v.member?.user?.bot && v.channelId)?.channelId;
            const resolvedId = botVcId || memberVcId;
            channel = resolvedId ? guild.channels.cache.get(resolvedId) : null;
        }
        if (!channel || !channel.isVoiceBased()) throw new Error('No voice channel to join');

        // Faithful fake interaction so we can reuse the battle-tested handlePlay
        // path (the exact code Discord slash/prefix commands use).
        const fakeInteraction = {
            guild,
            guildId,
            member: { voice: { channel }, user: { id: 'web', username: 'Web Player' } },
            channel: { id: channel.id, send: (m) => Promise.resolve(m) },
            isChatInputCommand: () => false,
            reply: (m) => {},
            deferReply: () => Promise.resolve(),
            editReply: (m) => {},
        };

        // Join-only (e.g. "Open player"): mimic handlePlay's join block.
        if (!query) {
            const permError = this.commandHandler.checkVcAccess(fakeInteraction, channel);
            if (permError) throw new Error(permError.replace(/[❌⚠️]/g, '').trim());

            const node = this.playbackManager.getWorkingNode();
            if (!node) throw new Error('No Lavalink node available');

            const queue = this.queueManager.getQueue(guildId);
            let player = queue.player || this.shoukaku.players.get(guildId);
            if (!player && this.shoukaku.connections.has(guildId)) {
                try { await this.shoukaku.leaveVoiceChannel(guildId); } catch {}
            }
            if (!player) {
                player = await this.shoukaku.joinVoiceChannel({
                    guildId,
                    channelId: channel.id,
                    shardId: guild.shardId || 0,
                    deaf: true,
                    nodeName: node.name,
                });
                this.playbackManager.setupPlayerEvents(player, guildId, null);
                queue.player = player;
            }
            return;
        }

        // Play: reuse the exact same code path as Discord /play.
        await this.commandHandler.handlePlay(fakeInteraction, query);
    }

    async joinRemote(guildId) {
        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) throw new Error('Guild not found');

        // Find a voice channel with non-bot members
        const vs = guild.voiceStates.cache.find(v => !v.member?.user?.bot && v.channelId);
        const channelId = vs?.channelId;
        if (!channelId) throw new Error('No members in any voice channel');

        // Reuse the same path as playRemote (joins then state is live)
        await this.playRemote(guildId, channelId, null);
    }

    async playerAction(guildId, action, value) {
        const q = this.queueManager.getQueue(guildId);
        if (!q || !q.player) throw new Error('No active player');
        switch (action) {
            case 'pause': await q.player.setPaused(true); break;
            case 'resume': await q.player.setPaused(false); break;
            case 'skip': await q.player.stopTrack(); break;
            case 'stop':
                this.queueManager.clearQueue(guildId);
                q.playing = false;
                q.currentSong = null;
                await q.player.stopTrack();
                break;
            case 'volume':
                q.volume = Math.min(100, Math.max(0, value));
                await this.queueManager.refreshFilters(guildId);
                break;
            case 'seek': await q.player.seekTo(value * 1000); break;
            case 'loop': q.loopMode = (q.loopMode + 1) % 3; break;
            default: throw new Error('Unknown action');
        }
        return true;
    }

    setupSockets() {
        this.io.on('connection', (socket) => {
            console.log('Dashboard client connected');
            socket.emit('stats', this.getStats());

            socket.on('disconnect', () => {
                console.log('Dashboard client disconnected');
            });
        });

        // Periodic updates
        setInterval(() => {
            this.io.emit('stats', this.getStats());
        }, 5000);
    }

    getStats() {
        const guilds = this.client.guilds.cache;
        const nodes = Array.from(this.shoukaku.nodes.values()).map(n => ({
            name: n.name,
            state: n.state,
            players: n.stats?.players || 0,
            cpu: n.stats?.cpu ? (n.stats.cpu.lavalinkLoad * 100).toFixed(2) : '0.00',
            memory: n.stats?.memory ? (n.stats.memory.used / 1024 / 1024).toFixed(0) : '0'
        }));

        const allGuilds = guilds.map(g => ({
            id: g.id,
            name: g.name,
            icon: g.iconURL({ dynamic: true }),
            memberCount: g.memberCount,
            isActive: this.queueManager.queues.has(g.id) && this.queueManager.queues.get(g.id).playing
        }));

        const activeListeners = [];
        guilds.forEach(guild => {
            guild.voiceStates.cache.forEach(vs => {
                if (vs.member && !vs.member.user.bot && vs.channelId) {
                    activeListeners.push({
                        id: vs.member.id,
                        username: vs.member.user.username,
                        avatar: vs.member.user.displayAvatarURL({ dynamic: true }),
                        guildName: guild.name,
                        channelName: vs.channel ? vs.channel.name : 'Unknown VC'
                    });
                }
            });
        });

        const activeGuilds = Array.from(this.queueManager.queues.entries())
            .filter(([_, q]) => q.playing && q.currentSong && q.player)
            .map(([guildId, q]) => {
                const guild = guilds.get(guildId);
                return {
                    id: guildId,
                    name: guild ? guild.name : 'Unknown Guild',
                    icon: guild ? guild.iconURL() : null,
                    nodeName: q.player.node.name,
                    position: q.player.position,
                    durationMs: q.player.track?.info?.length || 0,
                    nowPlaying: {
                        title: q.currentSong.title,
                        thumbnail: q.currentSong.thumbnail,
                        requester: q.currentSong.requester.username,
                        duration: q.currentSong.duration
                    },
                    queue: q.songs.slice(0, 5).map(s => ({
                        title: s.title,
                        requester: s.requester.username
                    }))
                };
            });

        return {
            totalGuilds: guilds.size,
            totalMembers: guilds.reduce((acc, g) => acc + g.memberCount, 0),
            activePlayers: activeGuilds.length,
            nodes,
            allGuilds,
            activeListeners,
            activeGuilds
        };
    }

    start() {
        this.server.listen(this.port, () => {
            console.log(`✅ Dashboard is running on http://localhost:${this.port}`);
        });
    }

    broadcastUpdate() {
        this.io.emit('stats', this.getStats());
    }
}

module.exports = Dashboard;
