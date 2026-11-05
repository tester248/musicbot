const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

/**
 * Minimal JSON-backed persistence store.
 * Loads once at startup into memory, and persists on mutation.
 * Suitable for a single-instance bot; swap for SQLite/Postgres later if needed.
 */
class JsonStore {
    constructor(filename) {
        this.filePath = path.join(DATA_DIR, filename);
        this.data = {};
        this._load();
    }

    _load() {
        try {
            if (fs.existsSync(this.filePath)) {
                this.data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
            }
        } catch (e) {
            console.error(`[storage] failed to load ${this.filePath}:`, e);
            this.data = {};
        }
    }

    async save() {
        try {
            if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
            await fs.promises.writeFile(this.filePath, JSON.stringify(this.data, null, 2));
        } catch (e) {
            console.error(`[storage] failed to save ${this.filePath}:`, e);
        }
    }

    /** Get a top-level key. */
    get(key, fallback = null) {
        return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key] : fallback;
    }

    /** Set a top-level key and persist. */
    async set(key, value) {
        this.data[key] = value;
        await this.save();
    }

    async delete(key) {
        if (Object.prototype.hasOwnProperty.call(this.data, key)) {
            delete this.data[key];
            await this.save();
        }
    }

    /** Get (and lazily create) a per-guild namespace object. */
    guild(guildId, fallback = {}) {
        if (!this.data[guildId]) this.data[guildId] = fallback;
        return this.data[guildId];
    }

    /** Persist a per-guild namespace after mutating it. */
    async saveGuild(guildId) {
        await this.save();
    }
}

module.exports = { JsonStore, DATA_DIR };
