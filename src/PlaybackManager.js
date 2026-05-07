const { EmbedBuilder } = require('discord.js');

class PlaybackManager {
    constructor(shoukaku, queueManager, musicPlayer, dashboard) {
        this.shoukaku = shoukaku;
        this.queueManager = queueManager;
        this.musicPlayer = musicPlayer;
        this.dashboard = dashboard;
        this.nodeScores = new Map();
        this.preferredNodeName = null;
        this.badNodes = new Set();
    }

    /**
     * Update node score based on performance
     * @param {string} name Node name
     * @param {number} delta Score change
     */
    updateNodeScore(name, delta) {
        const currentScore = this.nodeScores.get(name) || 0;
        this.nodeScores.set(name, currentScore + delta);
    }

    /**
     * Get the best working node based on scores and state
     */
    getWorkingNode() {
        let node = this.preferredNodeName ? this.shoukaku.nodes.get(this.preferredNodeName) : null;
        
        // If preferred node is bad or disconnected, find a new one
        if (!node || node.state !== 1 || this.badNodes.has(node.name)) {
            const availableNodes = [...this.shoukaku.nodes.values()]
                .filter(n => n.state === 1 && !this.badNodes.has(n.name))
                .sort((a, b) => {
                    const scoreA = this.nodeScores.get(a.name) || 0;
                    const scoreB = this.nodeScores.get(b.name) || 0;
                    
                    // Prioritize score, then least players
                    if (scoreB !== scoreA) return scoreB - scoreA;
                    
                    const countA = a.players?.size ?? a.stats?.players ?? 0;
                    const countB = b.players?.size ?? b.stats?.players ?? 0;
                    return countA - countB;
                });
            
            node = availableNodes[0];
            if (node) {
                this.preferredNodeName = node.name;
                console.log(`🌟 Preferred node updated to: ${node.name}`);
            }
        }
        return node;
    }

    /**
     * Test a node's YouTube search capability
     */
    async testNode(name) {
        try {
            const node = this.shoukaku.nodes.get(name);
            if (!node) return;
            
            const result = await node.rest.resolve('ytsearch:never gonna give you up');
            
            if (result && result.loadType !== 'error' && result.loadType !== 'empty') {
                console.log(`✅ Node ${name} passed YouTube test`);
                this.updateNodeScore(name, 100);
                if (!this.preferredNodeName) this.preferredNodeName = name;
            } else {
                console.log(`⚠️ Node ${name} failed YouTube test (LoadType: ${result?.loadType})`);
                this.updateNodeScore(name, -50);
            }
        } catch (err) {
            console.log(`⚠️ Node ${name} threw error during test: ${err.message}`);
            this.badNodes.add(name);
            this.updateNodeScore(name, -100);
        }
    }

    /**
     * Handle playback exceptions and trigger failover
     */
    async handleTrackException(player, err, guildId) {
        console.error(`[Playback] Exception in guild ${guildId}:`, err.exception?.message || err);

        const queue = this.queueManager.getQueue(guildId);
        let failedSong = queue.currentSong || queue.previousSong;

        if (!failedSong) {
            console.log('[Playback] No failed song found in queue, skipping...');
            await this.queueManager.playNext(guildId);
            return;
        }

        // Penalize the current node
        this.updateNodeScore(player.node.name, -20);
        
        if (!failedSong.triedNodes) failedSong.triedNodes = [];
        if (!failedSong.triedNodes.includes(player.node.name)) {
            failedSong.triedNodes.push(player.node.name);
        }

        const isLoginError = (err.exception?.message || '').includes('requires login');
        
        // Find alternative nodes
        const availableNodes = [...this.shoukaku.nodes.values()]
            .filter(n => n.state === 1 && !failedSong.triedNodes.includes(n.name) && !this.badNodes.has(n.name))
            .sort((a, b) => (this.nodeScores.get(b.name) || 0) - (this.nodeScores.get(a.name) || 0));

        if (availableNodes.length > 0 && (isLoginError || failedSong.retryCount < 3)) {
            const nextNode = availableNodes[0];
            console.log(`🚀 YouTube failed on ${player.node.name}${isLoginError ? ' (Login)' : ''}. Moving to ${nextNode.name}...`);
            
            // Inform user about failover
            if (queue.textChannel) {
                queue.textChannel.send(`⚠️ **YouTube block detected on current node.** Trying alternative node (${nextNode.name})...`).catch(() => {});
            }

            try {
                await player.move(nextNode.name);
                this.preferredNodeName = nextNode.name;
                
                // Re-resolve and play
                const searchType = failedSong.originalQuery.startsWith('http') ? '' : 'ytsearch:';
                const result = await player.node.rest.resolve(failedSong.originalQuery.startsWith('http') ? failedSong.originalQuery : `${searchType}${failedSong.originalQuery}`);

                if (result && result.data && (Array.isArray(result.data) ? result.data.length > 0 : result.data)) {
                    const newTrack = Array.isArray(result.data) ? result.data[0] : result.data;
                    failedSong.encoded = newTrack.encoded;
                    failedSong.retryCount++;

                    queue.songs.unshift(failedSong);
                    queue.currentSong = null;
                    queue.playing = false;

                    await this.queueManager.playNext(guildId);
                    return;
                }
            } catch (resolveErr) {
                console.error('[Playback] Re-resolve failed:', resolveErr.message);
            }
        }

        // Final fallback to SoundCloud
        console.log(`❌ YouTube failed on all nodes for "${failedSong.title}", falling back to SoundCloud...`);
        if (queue.textChannel) {
            queue.textChannel.send(`🔍 YouTube failed cluster-wide. Falling back to SoundCloud for **${failedSong.title}**...`).catch(() => {});
        }
        await this.handlePlaybackFallback(guildId, failedSong.title, failedSong.requester);
    }

    /**
     * Fallback to SoundCloud search
     */
    async handlePlaybackFallback(guildId, query, requester) {
        const node = this.getWorkingNode();
        if (!node) {
            console.log('❌ No node available for fallback');
            await this.queueManager.playNext(guildId);
            return;
        }

        try {
            console.log(`🔍 Searching SoundCloud for: ${query}`);
            const result = await node.rest.resolve(`scsearch:${query}`);

            if (result && result.loadType === 'search' && result.data.length > 0) {
                const scTrack = result.data[0];
                const queue = this.queueManager.getQueue(guildId);
                
                queue.songs.unshift({
                    title: scTrack.info.title,
                    url: scTrack.info.uri,
                    duration: this.musicPlayer.formatDuration(scTrack.info.length / 1000),
                    thumbnail: scTrack.info.artworkUrl || '',
                    requester: requester,
                    encoded: scTrack.encoded,
                    originalQuery: query,
                    retryCount: 0,
                    triedClients: [],
                    triedNodes: []
                });
                
                queue.currentSong = null;
                queue.playing = false;
                await this.queueManager.playNext(guildId);
                return;
            }
        } catch (error) {
            console.error('[Playback] SoundCloud fallback failed:', error.message);
        }

        console.log(`❌ All fallbacks failed for "${query}", skipping...`);
        const queue = this.queueManager.getQueue(guildId);
        queue.currentSong = null;
        queue.playing = false;
        await this.queueManager.playNext(guildId);
    }

    /**
     * Attach listeners to a player
     */
    setupPlayerEvents(player, guildId, textChannel) {
        const queue = this.queueManager.getQueue(guildId);
        if (textChannel) queue.textChannel = textChannel;

        player.on('start', () => {
            this.updateNodeScore(player.node.name, 5);
            this.dashboard.broadcastUpdate();
            
            const queue = this.queueManager.getQueue(guildId);
            
            // Success notification after failover
            if (queue.currentSong && queue.currentSong.retryCount > 0 && queue.textChannel) {
                queue.textChannel.send(`✅ **Playback started successfully** on **${player.node.name}**!`).catch(() => {});
                
                // Connection Sync: Sometimes players stay silent after a move.
                // Re-sending the server update can nudge the node to re-establish the UDP connection.
                if (player.voice) {
                    player.sendServerUpdate(player.voice);
                }
            }

            // Only post "Now Playing" embed if this is the first attempt (not a node-switch retry)
            if (queue.currentSong && queue.textChannel && (!queue.currentSong.retryCount || queue.currentSong.retryCount === 0)) {
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
                textChannel.send({ embeds: [embed] }).catch(() => {});
            }
        });

        player.on('end', (data) => {
            if (data.reason === 'replaced' || data.reason === 'loadFailed') return;
            this.queueManager.playNext(guildId);
            this.dashboard.broadcastUpdate();
        });

        player.on('exception', (err) => this.handleTrackException(player, err, guildId));
    }
}

module.exports = PlaybackManager;
