import { assertNodeErrorFree } from '../../WABinary/index.js';
export class USyncUsernameProtocol {
    constructor() {
        this.name = 'username';
    }
    getQueryElement() {
        return {
            tag: 'username',
            attrs: {}
        };
    }
    getUserElement(user) {
        void user;
        return null;
    }
    parser(node) {
        if (node.tag === 'username') {
            assertNodeErrorFree(node);
            const username = node.content != null ? node.content.toString() : null;
            return username && username.length > 0 ? username : null;
        }
        return null;
    }
}
