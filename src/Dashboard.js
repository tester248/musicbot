const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

class Dashboard {
    constructor(client, queueManager, shoukaku) {
        this.client = client;
        this.queueManager = queueManager;
        this.shoukaku = shoukaku;
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = new Server(this.server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });
        this.port = process.env.PORT || 3000;

        this.setupExpress();
        this.setupSockets();
    }

    setupExpress() {
        this.app.use(express.static(path.join(__dirname, '../public')));

        this.app.get('/api/stats', (req, res) => {
            res.json(this.getStats());
        });
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
                if (vs.member && !vs.member.user.bot) {
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
