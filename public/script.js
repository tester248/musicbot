const socket = io();

const themeSwitcher = document.getElementById('themeSwitcher');
const totalGuildsEl = document.getElementById('totalGuilds');
const totalMembersEl = document.getElementById('totalMembers');
const activePlayersEl = document.getElementById('activePlayers');
const guildsGrid = document.getElementById('guildsGrid');

// Theme Switcher
themeSwitcher.addEventListener('click', () => {
    document.body.classList.toggle('dark-theme');
    themeSwitcher.textContent = document.body.classList.contains('dark-theme') ? '🌙' : '☀️';
});

socket.on('stats', (data) => {
    updateStats(data);
});

function updateStats(data) {
    totalGuildsEl.textContent = data.totalGuilds.toLocaleString();
    totalMembersEl.textContent = data.totalMembers.toLocaleString();
    activePlayersEl.textContent = data.activePlayers.toLocaleString();

    if (data.activeGuilds.length === 0) {
        guildsGrid.innerHTML = '<div class="empty-state">No music playing right now.</div>';
        return;
    }

    guildsGrid.innerHTML = data.activeGuilds.map(guild => `
        <div class="guild-card">
            <div class="guild-info">
                <img src="${guild.icon || 'https://cdn.discordapp.com/embed/avatars/0.png'}" alt="${guild.name}">
                <span>${guild.name}</span>
            </div>
            <div class="now-playing-content">
                <img src="${guild.nowPlaying.thumbnail || 'https://via.placeholder.com/80'}" class="thumbnail" alt="thumbnail">
                <div class="track-details">
                    <h4>${guild.nowPlaying.title}</h4>
                    <p>By: ${guild.nowPlaying.requester}</p>
                    <p>Duration: ${guild.nowPlaying.duration}</p>
                </div>
            </div>
        </div>
    `).join('');
}
