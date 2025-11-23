import discord
from discord.ext import commands
from discord import app_commands
import yt_dlp
import asyncio
import traceback
import sys
import os
from collections import deque
import re

# Suppress noise about console usage from errors
yt_dlp.utils.bug_reports_message = lambda *args, **kwargs: ''

# Get absolute path for cookies
cookies_path = os.path.abspath('cookies.txt')
print(f"Checking for cookies at: {cookies_path}")
print(f"Cookies file exists: {os.path.exists(cookies_path)}")

ytdl_format_options = {
    'format': 'worst[abr>0]/worst',
    'outtmpl': '%(extractor)s-%(id)s-%(title)s.%(ext)s',
    'restrictfilenames': True,
    'noplaylist': True,
    'nocheckcertificate': True,
    'ignoreerrors': True,
    'logtostderr': False,
    'quiet': True,
    'no_warnings': True,
    'default_search': 'ytsearch:',
    'source_address': '0.0.0.0',
    'http_headers': {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'}
}

if os.path.exists(cookies_path):
    ytdl_format_options['cookiefile'] = cookies_path
    print(f"Using cookies file: {cookies_path}")
else:
    print("No cookies file found!")

ffmpeg_options = {
    'options': '-vn -filter:a "volume=0.5"',
    'before_options': '-reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5',
}

ytdl = yt_dlp.YoutubeDL(ytdl_format_options)

class Song:
    def __init__(self, data, requester):
        self.title = data.get('title')
        self.url = data.get('url')
        self.webpage_url = data.get('webpage_url')
        self.duration = data.get('duration')
        self.thumbnail = data.get('thumbnail')
        self.uploader = data.get('uploader')
        self.requester = requester
        self.data = data

    def __str__(self):
        return f"{self.title} - {self.uploader}"

class YTDLSource(discord.PCMVolumeTransformer):
    def __init__(self, source, *, data, volume=0.5):
        super().__init__(source, volume)
        self.data = data
        self.title = data.get('title')
        self.url = data.get('url')

    @classmethod
    async def from_song(cls, song, *, loop=None):
        loop = loop or asyncio.get_event_loop()
        return cls(discord.FFmpegPCMAudio(song.url, **ffmpeg_options), data=song.data)

    @classmethod
    async def search_and_create_song(cls, query, requester, *, loop=None):
        loop = loop or asyncio.get_event_loop()
        
        # Check if it's a URL or search term
        url_pattern = re.compile(r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+')
        if not url_pattern.match(query):
            query = f"ytsearch:{query}"
            
        try:
            data = await loop.run_in_executor(None, lambda: ytdl.extract_info(query, download=False))
            
            if 'entries' in data:
                if len(data['entries']) == 0:
                    return None
                data = data['entries'][0]
                
            return Song(data, requester)
        except Exception as e:
            print(f"Error searching for {query}: {e}")
            return None

class MusicQueue:
    def __init__(self):
        self.queue = deque()
        self.current = None
        self.loop_queue = False
        self.loop_current = False

    def add(self, song):
        self.queue.append(song)

    def get_next(self):
        if self.loop_current and self.current:
            return self.current
            
        if not self.queue:
            return None
            
        song = self.queue.popleft()
        
        if self.loop_queue and self.current:
            self.queue.append(self.current)
            
        self.current = song
        return song

    def skip(self):
        if self.queue:
            return self.get_next()
        return None

    def clear(self):
        self.queue.clear()
        self.current = None

    def is_empty(self):
        return len(self.queue) == 0

    def __len__(self):
        return len(self.queue)

class Music(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.queues = {}  # Guild ID -> MusicQueue

    def get_queue(self, guild_id):
        if guild_id not in self.queues:
            self.queues[guild_id] = MusicQueue()
        return self.queues[guild_id]

    async def play_next(self, ctx):
        queue = self.get_queue(ctx.guild.id)
        
        if ctx.voice_client is None:
            return
            
        next_song = queue.get_next()
        if next_song is None:
            await ctx.send("Queue is empty!")
            return
            
        try:
            source = await YTDLSource.from_song(next_song)
            ctx.voice_client.play(source, after=lambda e: self.bot.loop.create_task(self.song_finished(ctx, e)))
            
            embed = discord.Embed(
                title="🎵 Now Playing",
                description=f"**{next_song.title}**",
                color=0x00ff00
            )
            embed.add_field(name="Uploader", value=next_song.uploader or "Unknown", inline=True)
            embed.add_field(name="Requested by", value=next_song.requester.mention, inline=True)
            if next_song.duration:
                mins, secs = divmod(next_song.duration, 60)
                embed.add_field(name="Duration", value=f"{mins}:{secs:02d}", inline=True)
            if next_song.thumbnail:
                embed.set_thumbnail(url=next_song.thumbnail)
                
            await ctx.send(embed=embed)
            
        except Exception as e:
            print(f"Error playing song: {e}")
            await ctx.send(f"Error playing song: {e}")
            await self.play_next(ctx)

    async def song_finished(self, ctx, error):
        if error:
            print(f'Player error: {error}')
        await self.play_next(ctx)

    # Text Commands
    @commands.command(name='join', aliases=['j'])
    async def join(self, ctx, *, channel: discord.VoiceChannel = None):
        """Joins a voice channel"""
        if channel is None:
            if ctx.author.voice:
                channel = ctx.author.voice.channel
            else:
                return await ctx.send("You need to be in a voice channel or specify one!")

        if ctx.voice_client is not None:
            return await ctx.voice_client.move_to(channel)

        await channel.connect()
        await ctx.send(f"Connected to {channel.name}")

    @commands.command(name='play', aliases=['p'])
    async def play(self, ctx, *, query):
        """Plays a song from YouTube (URL or search term)"""
        async with ctx.typing():
            song = await YTDLSource.search_and_create_song(query, ctx.author)
            
            if song is None:
                return await ctx.send("Could not find any songs with that query.")

            queue = self.get_queue(ctx.guild.id)
            
            if ctx.voice_client.is_playing() or ctx.voice_client.is_paused():
                queue.add(song)
                embed = discord.Embed(
                    title="📝 Added to Queue",
                    description=f"**{song.title}**",
                    color=0x0099ff
                )
                embed.add_field(name="Position", value=f"{len(queue)}", inline=True)
                embed.add_field(name="Requested by", value=ctx.author.mention, inline=True)
                await ctx.send(embed=embed)
            else:
                queue.current = song
                await self.play_next(ctx)

    @commands.command(name='pause')
    async def pause(self, ctx):
        """Pauses the current song"""
        if ctx.voice_client.is_playing():
            ctx.voice_client.pause()
            await ctx.send("⏸️ Paused")
        else:
            await ctx.send("Nothing is playing!")

    @commands.command(name='resume', aliases=['unpause'])
    async def resume(self, ctx):
        """Resumes the current song"""
        if ctx.voice_client.is_paused():
            ctx.voice_client.resume()
            await ctx.send("▶️ Resumed")
        else:
            await ctx.send("Nothing is paused!")

    @commands.command(name='skip', aliases=['s'])
    async def skip(self, ctx):
        """Skips the current song"""
        if ctx.voice_client.is_playing():
            ctx.voice_client.stop()
            await ctx.send("⏭️ Skipped")
        else:
            await ctx.send("Nothing is playing!")

    @commands.command(name='stop')
    async def stop(self, ctx):
        """Stops playback and clears the queue"""
        queue = self.get_queue(ctx.guild.id)
        queue.clear()
        
        if ctx.voice_client.is_playing():
            ctx.voice_client.stop()
            
        await ctx.send("⏹️ Stopped and cleared queue")

    @commands.command(name='queue', aliases=['q'])
    async def show_queue(self, ctx):
        """Shows the current queue"""
        queue = self.get_queue(ctx.guild.id)
        
        if queue.is_empty() and queue.current is None:
            return await ctx.send("Queue is empty!")

        embed = discord.Embed(title="🎵 Music Queue", color=0x0099ff)
        
        if queue.current:
            embed.add_field(
                name="Now Playing",
                value=f"**{queue.current.title}** - {queue.current.requester.mention}",
                inline=False
            )

        if not queue.is_empty():
            queue_text = ""
            for i, song in enumerate(list(queue.queue)[:10], 1):
                queue_text += f"{i}. **{song.title}** - {song.requester.mention}\n"
            
            if len(queue.queue) > 10:
                queue_text += f"... and {len(queue.queue) - 10} more"
                
            embed.add_field(name="Up Next", value=queue_text, inline=False)
        
        embed.set_footer(text=f"Total songs in queue: {len(queue)}")
        await ctx.send(embed=embed)

    @commands.command(name='nowplaying', aliases=['np'])
    async def now_playing(self, ctx):
        """Shows the currently playing song"""
        queue = self.get_queue(ctx.guild.id)
        
        if queue.current is None:
            return await ctx.send("Nothing is playing!")

        song = queue.current
        embed = discord.Embed(
            title="🎵 Now Playing",
            description=f"**{song.title}**",
            color=0x00ff00
        )
        embed.add_field(name="Uploader", value=song.uploader or "Unknown", inline=True)
        embed.add_field(name="Requested by", value=song.requester.mention, inline=True)
        if song.duration:
            mins, secs = divmod(song.duration, 60)
            embed.add_field(name="Duration", value=f"{mins}:{secs:02d}", inline=True)
        if song.thumbnail:
            embed.set_thumbnail(url=song.thumbnail)
            
        await ctx.send(embed=embed)

    @commands.command(name='volume', aliases=['vol'])
    async def volume(self, ctx, volume: int = None):
        """Changes or shows the player's volume (0-100)"""
        if ctx.voice_client is None:
            return await ctx.send("Not connected to a voice channel.")

        if volume is None:
            current_vol = int(ctx.voice_client.source.volume * 100) if hasattr(ctx.voice_client.source, 'volume') else 50
            return await ctx.send(f"Current volume: {current_vol}%")

        if not 0 <= volume <= 100:
            return await ctx.send("Volume must be between 0 and 100")

        if hasattr(ctx.voice_client.source, 'volume'):
            ctx.voice_client.source.volume = volume / 100
            await ctx.send(f"🔊 Volume set to {volume}%")
        else:
            await ctx.send("No audio source to adjust volume.")

    @commands.command(name='leave', aliases=['disconnect', 'dc'])
    async def leave(self, ctx):
        """Disconnects the bot from voice channel"""
        if ctx.voice_client:
            queue = self.get_queue(ctx.guild.id)
            queue.clear()
            await ctx.voice_client.disconnect()
            await ctx.send("👋 Disconnected")
        else:
            await ctx.send("Not connected to a voice channel.")

    @commands.command(name='clear')
    async def clear_queue(self, ctx):
        """Clears the queue"""
        queue = self.get_queue(ctx.guild.id)
        queue.queue.clear()
        await ctx.send("🗑️ Queue cleared")

    # Slash Commands
    @app_commands.command(name="play", description="Play a song from YouTube")
    async def slash_play(self, interaction: discord.Interaction, query: str):
        """Slash command to play music"""
        await interaction.response.defer()
        
        if not await self.ensure_voice_slash(interaction):
            return
            
        # Create a context-like object for the play method
        ctx = await commands.Context.from_interaction(interaction)
        await self.play(ctx, query=query)

    @app_commands.command(name="pause", description="Pause the current song")
    async def slash_pause(self, interaction: discord.Interaction):
        ctx = await commands.Context.from_interaction(interaction)
        await self.pause(ctx)

    @app_commands.command(name="resume", description="Resume the current song")
    async def slash_resume(self, interaction: discord.Interaction):
        ctx = await commands.Context.from_interaction(interaction)
        await self.resume(ctx)

    @app_commands.command(name="skip", description="Skip the current song")
    async def slash_skip(self, interaction: discord.Interaction):
        ctx = await commands.Context.from_interaction(interaction)
        await self.skip(ctx)

    @app_commands.command(name="queue", description="Show the music queue")
    async def slash_queue(self, interaction: discord.Interaction):
        ctx = await commands.Context.from_interaction(interaction)
        await self.show_queue(ctx)

    @app_commands.command(name="nowplaying", description="Show the currently playing song")
    async def slash_nowplaying(self, interaction: discord.Interaction):
        ctx = await commands.Context.from_interaction(interaction)
        await self.now_playing(ctx)

    @app_commands.command(name="volume", description="Set the volume (0-100)")
    async def slash_volume(self, interaction: discord.Interaction, volume: int):
        ctx = await commands.Context.from_interaction(interaction)
        await self.volume(ctx, volume)

    @app_commands.command(name="stop", description="Stop playback and clear queue")
    async def slash_stop(self, interaction: discord.Interaction):
        ctx = await commands.Context.from_interaction(interaction)
        await self.stop(ctx)

    @app_commands.command(name="leave", description="Disconnect from voice channel")
    async def slash_leave(self, interaction: discord.Interaction):
        ctx = await commands.Context.from_interaction(interaction)
        await self.leave(ctx)

    # Event handlers
    @play.before_invoke
    async def ensure_voice(self, ctx):
        if ctx.voice_client is None:
            if ctx.author.voice:
                await ctx.author.voice.channel.connect()
            else:
                await ctx.send("You are not connected to a voice channel.")
                raise commands.CommandError("Author not connected to a voice channel.")

    async def ensure_voice_slash(self, interaction: discord.Interaction):
        """Ensure voice connection for slash commands"""
        if interaction.guild.voice_client is None:
            if interaction.user.voice:
                await interaction.user.voice.channel.connect()
            else:
                await interaction.response.send_message("You are not connected to a voice channel.", ephemeral=True)
                return False
        return True

intents = discord.Intents.default()
intents.message_content = True

bot = commands.Bot(command_prefix='!', intents=intents)

@bot.event
async def on_ready():
    print(f'Logged in as {bot.user} (ID: {bot.user.id})')
    print('Syncing slash commands...')
    try:
        synced = await bot.tree.sync()
        print(f'Synced {len(synced)} slash commands')
    except Exception as e:
        print(f'Failed to sync slash commands: {e}')
    print('------')
    print('Music Bot Ready! 🎵')
    print('Commands: !play, !pause, !resume, !skip, !stop, !queue, !nowplaying, !volume, !join, !leave')
    print('Slash commands are also available!')

async def main():
    async with bot:
        await bot.add_cog(Music(bot))
        # REPLACE 'YOUR_TOKEN_HERE' WITH YOUR REAL DISCORD BOT TOKEN
        await bot.start('')

if __name__ == "__main__":
    asyncio.run(main())
