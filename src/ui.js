const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');

const NP_BUTTONS = {
    PAUSE: 'np:pause',
    RESUME: 'np:resume',
    SKIP: 'np:skip',
    STOP: 'np:stop',
    LOOP: 'np:loop',
};

/**
 * Build the "Now Playing" embed for a guild's queue.
 */
function nowPlayingEmbed(queue) {
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
    return embed;
}

/**
 * Build the interactive control buttons for the now-playing message.
 */
function nowPlayingComponents(queue, { paused = false } = {}) {
    const pauseLabel = paused ? '▶️' : '⏸️';
    const pause = new ButtonBuilder()
        .setCustomId(paused ? NP_BUTTONS.RESUME : NP_BUTTONS.PAUSE)
        .setEmoji(pauseLabel)
        .setStyle(ButtonStyle.Secondary);

    const skip = new ButtonBuilder()
        .setCustomId(NP_BUTTONS.SKIP)
        .setEmoji('⏭️')
        .setStyle(ButtonStyle.Secondary);

    const stop = new ButtonBuilder()
        .setCustomId(NP_BUTTONS.STOP)
        .setEmoji('⏹️')
        .setStyle(ButtonStyle.Danger);

    const loopLabel = queue.loopMode === 1 ? '🔁 Track' : (queue.loopMode === 2 ? '🔂 Queue' : '➡️ Loop');
    const loop = new ButtonBuilder()
        .setCustomId(NP_BUTTONS.LOOP)
        .setLabel(loopLabel)
        .setStyle(ButtonStyle.Secondary);

    return [new ActionRowBuilder().addComponents(pause, skip, stop, loop)];
}

/**
 * A single object combining embed + components for the now-playing message.
 */
function nowPlayingPayload(queue, options = {}) {
    return {
        embeds: [nowPlayingEmbed(queue)],
        components: nowPlayingComponents(queue, options),
    };
}

// ---- Interactive queue panel ----

const Q_PAGE_SIZE = 5;

function queuePageCount(queue) {
    return Math.max(1, Math.ceil(queue.songs.length / Q_PAGE_SIZE));
}

function queueEmbed(queue, page) {
    const totalPages = queuePageCount(queue);
    const currentPage = Math.min(Math.max(1, page), totalPages);
    const start = (currentPage - 1) * Q_PAGE_SIZE;
    const pageSongs = queue.songs.slice(start, start + Q_PAGE_SIZE);

    const embed = new EmbedBuilder().setColor('#0099ff').setTitle('🎶 Music Queue');
    if (queue.currentSong) {
        embed.addFields({ name: 'Now Playing', value: `**${queue.currentSong.title}** | Requested by: ${queue.currentSong.requester.toString()}` });
    }
    if (pageSongs.length) {
        const lines = pageSongs.map((s, i) => `${start + i + 1}. **${s.title}** (${s.duration})`).join('\n');
        embed.setDescription(`**Up Next:**\n${lines}`);
    } else {
        embed.setDescription('No more songs in queue.');
    }
    embed.setFooter({ text: `Page ${currentPage}/${totalPages} | Total songs: ${queue.songs.length}` });
    return embed;
}

function queueComponents(queue, page) {
    const totalPages = queuePageCount(queue);
    const currentPage = Math.min(Math.max(1, page), totalPages);
    const start = (currentPage - 1) * Q_PAGE_SIZE;
    const pageSongs = queue.songs.slice(start, start + Q_PAGE_SIZE);

    const prev = new ButtonBuilder()
        .setCustomId('q:prev')
        .setEmoji('◀️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage <= 1);
    const next = new ButtonBuilder()
        .setCustomId('q:next')
        .setEmoji('▶️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage >= totalPages);
    const navRow = new ActionRowBuilder().addComponents(prev, next);

    const rows = [navRow];
    if (pageSongs.length) {
        const select = new StringSelectMenuBuilder()
            .setCustomId('q:pick')
            .setPlaceholder('Choose a track to manage…')
            .addOptions(pageSongs.map((s, i) => ({
                label: s.title.slice(0, 100),
                description: `${s.duration} · #${start + i + 1}`,
                value: String(start + i),
            })));
        rows.push(new ActionRowBuilder().addComponents(select));
    }
    return rows;
}

function queuePayload(queue, page) {
    return { embeds: [queueEmbed(queue, page)], components: queueComponents(queue, page) };
}

function queueTrackActionComponents(queueIndex) {
    const remove = new ButtonBuilder().setCustomId(`q:rm:${queueIndex}`).setLabel('Remove').setStyle(ButtonStyle.Danger);
    const top = new ButtonBuilder().setCustomId(`q:top:${queueIndex}`).setLabel('Move to top').setStyle(ButtonStyle.Secondary);
    const play = new ButtonBuilder().setCustomId(`q:play:${queueIndex}`).setLabel('Play now').setStyle(ButtonStyle.Primary);
    const cancel = new ButtonBuilder().setCustomId('q:cancel').setLabel('← Back').setStyle(ButtonStyle.Secondary);
    return [new ActionRowBuilder().addComponents(remove, top, play, cancel)];
}

module.exports = {
    nowPlayingEmbed, nowPlayingComponents, nowPlayingPayload, NP_BUTTONS,
    Q_PAGE_SIZE, queuePageCount, queueEmbed, queueComponents, queuePayload, queueTrackActionComponents,
};
