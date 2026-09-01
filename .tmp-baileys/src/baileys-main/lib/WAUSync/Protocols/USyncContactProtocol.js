import { assertNodeErrorFree } from '../../WABinary/index.js';
export class USyncContactProtocol {
    constructor() {
        this.name = 'contact';
    }
    getQueryElement() {
        return {
            tag: 'contact',
            attrs: {}
        };
    }
    getUserElement(user) {
        if (user.phone) {
            return {
                tag: 'contact',
                attrs: {},
                content: user.phone
            };
        }
        if (user.username) {
            return {
                tag: 'contact',
                attrs: {
                    username: user.username,
                    ...(user.usernameKey ? { pin: user.usernameKey } : {}),
                    ...(user.lid ? { lid: user.lid } : {})
                }
            };
        }
        if (user.type) {
            return {
                tag: 'contact',
                attrs: {
                    type: user.type
                }
            };
        }
        return {
            tag: 'contact',
            attrs: {}
        };
    }
    parser(node) {
        if (node.tag === 'contact') {
            assertNodeErrorFree(node);
            const inWA = node?.attrs?.type === 'in';
            const restrictionType = node?.attrs?.stella_addressbook_restriction_type;
            if (restrictionType !== undefined) {
                // Return object with extra metadata when restriction type is present
                return { inWA, stellaAddressbookRestrictionType: restrictionType };
            }
            return inWA;
        }
        return false;
    }
}
