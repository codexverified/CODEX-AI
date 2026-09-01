import { createCache } from 'cache-manager';
import { proto } from '../../WAProto/index.js';
import { BufferJSON, initAuthCreds } from '../Utils/index.js';
import logger from '../Utils/logger.js';

/**
 * Cache-manager backed auth state.
 *
 * `store` accepts anything cache-manager v7's createCache({ stores: [...] }) accepts:
 * a Keyv-compatible store instance (e.g. keyv/redis, keyv/sqlite) or a store factory.
 * Keys are namespaced under `${sessionKey}:` so multiple sessions can share one store.
 */
export const makeCacheManagerAuthState = async (store, sessionKey) => {
    const defaultKey = file => `${sessionKey}:${file}`;
    const databaseConn = createCache({ stores: [store], ttl: 0 });
    const writeData = async (file, data) => {
        let ttl = undefined;
        if (file === 'creds') {
            ttl = 63115200; // 2 years
        }
        await databaseConn.set(defaultKey(file), JSON.stringify(data, BufferJSON.replacer), ttl);
    };
    const readData = async (file) => {
        try {
            const data = await databaseConn.get(defaultKey(file));
            if (data) {
                return JSON.parse(data, BufferJSON.reviver);
            }
            return null;
        }
        catch (error) {
            logger.error(error);
            return null;
        }
    };
    const removeData = async (file) => {
        try {
            return await databaseConn.del(defaultKey(file));
        }
        catch (err) {
            logger.error({ err }, `Error removing ${file} from session ${sessionKey}`);
        }
    };
    const clearState = async () => {
        try {
            // Keyv-compatible stores expose keys(pattern); tolerate stores that don't.
            const keyed = typeof store?.keys === 'function' ? store : databaseConn;
            const keys = typeof keyed.keys === 'function' ? await keyed.keys(`${sessionKey}*`) : [];
            await Promise.all(keys.map(async key => await databaseConn.del(key)));
        }
        catch (err) {
            logger.warn({ err }, 'clearState failed');
        }
    };
    const creds = (await readData('creds')) || initAuthCreds();
    return {
        clearState,
        saveCreds: () => writeData('creds', creds),
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(
                        ids.map(async id => {
                            let value = await readData(`${type}-${id}`);
                            if (type === 'app-state-sync-key' && value) {
                                value = proto.Message.AppStateSyncKeyData.fromObject(value);
                            }
                            data[id] = value;
                        })
                    );
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const key = `${category}-${id}`;
                            tasks.push(value ? writeData(key, value) : removeData(key));
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        }
    };
};
