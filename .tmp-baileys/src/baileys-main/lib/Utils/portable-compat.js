import { generateRichMenuContent } from './message-composer.js';
import { prepareRichResponseMessage } from './rich-message-utils.js';

/** Build a prepared rich-menu payload for direct message generation. */
export const prepareRichMenuMessage = (content = {}, quoted, options = {}) => generateRichMenuContent(content, quoted, options);

/** Convert unsupported premium content to a safe plain-text rich response. */
export const downgradePremiumContent = (content = {}) => {
    if (typeof content === 'string') return prepareRichResponseMessage({ contentText: content, noDonation: true });
    const text = content.text || content.contentText || content.caption || '';
    return prepareRichResponseMessage({ contentText: String(text), noDonation: true });
};
