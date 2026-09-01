import { inflateSync } from 'zlib';
import { proto } from '../../WAProto/index.js';

/**
 * Decode a GroupHistory protobuf blob (community/group history container).
 * @param buffer raw bytes, optionally zlib-compressed
 * @param options.inflate try zlib.inflateSync first, falling back to raw bytes (default true)
 * @param options.withMessageBytes decode the GroupHistoryWithMessageBytes variant,
 *   expanding each entry's messageBytes into a WebMessageInfo (default false)
 */
export const decodeGroupHistory = (buffer, options = {}) => {
    const { inflate = true, withMessageBytes = false } = options;
    if (!Buffer.isBuffer(buffer) && !(buffer instanceof Uint8Array)) {
        throw new TypeError('decodeGroupHistory: buffer must be Buffer or Uint8Array');
    }
    let data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    if (inflate) {
        try {
            data = inflateSync(data);
        }
        catch {
            // not zlib-compressed  use raw bytes
        }
    }
    if (withMessageBytes) {
        const decoded = proto.GroupHistoryWithMessageBytes.decode(data);
        const expand = list =>
            (list || []).map(entry =>
                entry?.messageBytes ? proto.WebMessageInfo.decode(entry.messageBytes) : { key: entry?.key }
            );
        return {
            messages: expand(decoded.messages),
            commentMessages: expand(decoded.commentMessages),
            outOfWindowPinnedMessages: expand(decoded.outOfWindowPinnedMessages),
            uncountedAssociatedMessageLists: (decoded.uncountedAssociatedMessageLists || []).map(l => ({
                parentMessage: l.parentMessage,
                messages: expand(l.messages)
            }))
        };
    }
    return proto.GroupHistory.decode(data);
};

/**
 * Normalize a decoded GroupHistory into stable message buckets.
 * @param groupHistory a decoded proto.GroupHistory (or the withMessageBytes shape)
 */
export const processGroupHistory = (groupHistory) => {
    const gh = groupHistory || {};
    return {
        messages: gh.messages || [],
        commentMessages: gh.commentMessages || [],
        outOfWindowPinnedMessages: gh.outOfWindowPinnedMessages || [],
        uncountedAssociatedMessageLists: gh.uncountedAssociatedMessageLists || []
    };
};
