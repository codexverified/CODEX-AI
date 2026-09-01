export interface WAMessageKey {
    remoteJid?: string | null;
    fromMe?: boolean | null;
    id?: string | null;
    participant?: string | null;
}

export type StatusFont = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface StatusOptions {
    /** Users allowed to receive the status. At least one valid user JID is required. */
    statusJidList: string[];
    /** Hex, named, or ARGB status background color. */
    backgroundColor?: string | number;
    font?: StatusFont;
    messageId?: string;
    additionalAttributes?: Record<string, string>;
    additionalNodes?: unknown[];
}

export interface StatusContent {
    /** Convenience flag; alternatively send to `status@broadcast`. */
    status?: true;
    statusJidList?: string[];
    backgroundColor?: string | number;
    font?: StatusFont;
    text?: string;
    image?: unknown;
    video?: unknown;
    audio?: unknown;
    caption?: string;
    mimetype?: string;
    ptt?: boolean;
    seconds?: number;
    waveform?: Uint8Array;
    [key: string]: unknown;
}

export interface GroupStatusContent extends StatusContent {
    groupStatus: true;
}

/** One status distribution list entry as returned by `getStatusPrivacy`. */
export interface StatusPrivacyList {
    type?: string;
    id?: string;
    listname?: string;
    emoji?: string;
    selected?: boolean;
    deleted?: boolean;
    members: string[];
}

/** Custom named status list passed to `setStatusPrivacy`. */
export interface StatusCustomList {
    id: string;
    listname: string;
    emoji?: string;
    selected?: boolean;
    deleted?: boolean;
    members?: string[];
}

/** Result of `fetchBroadcastListQuota`. */
export interface BroadcastListQuota {
    messagesLeft: number;
    totalLimit: number;
    isHeavySender: boolean;
    startTs: number;
    endTs: number;
    resetTs: number;
}

/** Entry accepted by `storePrivacyTokens`. */
export interface PrivacyTokenEntry {
    jid: string;
    privacyToken: Buffer;
    privacyModeTs?: number | string;
}

/** A bot (persona) entry as returned by `getBotListV2` / `getBotProfile`. */
export interface BotProfile {
    jid?: string;
    personaId?: string;
    name?: string;
    description?: string;
}

/** A group profile picture as returned by `getGroupProfilePictures`. */
export interface GroupProfilePicture {
    jid?: string;
    type?: string;
    directPath?: string;
    url?: string;
}

/** Result of `groupJoinLinked`. */
export interface GroupJoinLinkedResult {
    approvalRequested: boolean;
}

/** Options for `aiGroupCreate`. */
export interface AIGroupCreateOptions {
    ephemeralExpiration?: number;
    memberAddMode?: string;
    memberShareGroupHistoryMode?: string;
    memberLinkMode?: string;
}

/** Options for `aiPrompt`. */
export interface AIPromptOptions {
    /** ms to wait for the bot response before rejecting (default 60000). */
    timeout?: number;
    /** Best-effort streaming hook  called with each bot message edit in the chat. */
    onPartial?: (message: unknown, key: WAMessageKey) => void;
    /** Canonical Meta AI bot JID (default `867051314767696@bot`). */
    botUser?: string;
    /** Extra JIDs to mention alongside the bot in group prompts. */
    mentions?: string[];
    /** Extra options forwarded to `sendMessage` (quoted, linkPreview, ...). */
    [key: string]: unknown;
}

export interface WASocket {
    sendMessage(jid: string | string[], content: StatusContent | GroupStatusContent | Record<string, unknown>, options?: Partial<StatusOptions> & Record<string, unknown>): Promise<unknown>;
    deleteGroupStatus(jid: string, key: WAMessageKey): Promise<unknown>;
    /** Reports the contact and blocks it after WhatsApp accepts the report. */
    reportContact(jid: string, messageKeys?: WAMessageKey[]): Promise<unknown>;
    /** Reports the group and leaves it after WhatsApp accepts the report. */
    reportGroup(jid: string, messageKeys?: WAMessageKey[]): Promise<unknown>;

    // ---- WA-Web chat features (ported from baron-baileys-v2) ----
    getStatusPrivacy(): Promise<StatusPrivacyList[] | null>;
    setStatusPrivacy(type: 'contacts' | 'whitelist' | 'blacklist' | 'null', jids?: string[], customLists?: StatusCustomList[]): Promise<unknown>;
    fetchBroadcastListQuota(): Promise<BroadcastListQuota | null>;
    getChatBlockingStatus(): Promise<'blocked' | 'unblocked' | undefined>;
    updateChatBlockingStatus(action: 'block' | 'unblock'): Promise<'blocked' | 'unblocked' | undefined>;
    getUserDisclosures(t?: number): Promise<Record<string, string>[]>;
    acceptTosNotice(noticeId: string | number, result?: string | number): Promise<unknown>;
    reportSpam(jid: string, messages?: Array<{ id: string; t: number }>, spamFlow?: string, subject?: string): Promise<unknown>;
    getOptOutList(): Promise<unknown>;
    signPrivateCredential(blindedCredential: Buffer): Promise<Buffer | undefined>;
    getPushConfig(): Promise<unknown>;
    setPushConfig(config: Record<string, string>): Promise<unknown>;
    toggleCallLinkWaitingRoom(linkToken: string, enabled: boolean, media?: 'audio' | 'video'): Promise<Record<string, string> | undefined>;
    storePrivacyTokens(entries: PrivacyTokenEntry[]): Promise<void>;
    updateBioPrivacy(value: string): Promise<unknown>;
    blockBot(botJid: string): Promise<unknown>;
    unblockBot(botJid: string): Promise<unknown>;
    getBotListV2(): Promise<BotProfile[]>;
    getBotProfile(botJid: string): Promise<BotProfile | null>;
    fetchABProps(protocol?: string, hash?: string, refreshId?: string | null, group?: string | null): Promise<Record<string, string>>;
    removeCompanionDevice(jid: string, reason?: string): Promise<unknown>;
    updateKeyIndexList(ts: number | string, content: Buffer): Promise<unknown>;
    sendKeyIndexList(): Promise<void>;
    fetchMediaConn(lastId?: string | null): Promise<unknown>;
    deleteBroadcastList(listId: string | number): Promise<unknown>;
    fetchQRCode(code: string, addressingMode?: 'lid' | null): Promise<unknown>;
    confirmDeviceLogout(id: string | number, approve?: boolean): Promise<unknown>;

    // ---- Group calls ----
    /** Start a group call in `jid`, ringing each participant JID. Returns { id, to }. */
    groupCall(jid: string, participants?: string[], isVideo?: boolean): Promise<{ id: string; to: string }>;
    /** Cancel / hang up a group call started with `groupCall`. Returns { id, to }. */
    cancelGroupCall(jid: string, callId: string): Promise<{ id: string; to: string }>;

    // ---- AI groups (ported from baron-baileys-v2) ----
    aiGroupMetadata(jid: string): Promise<unknown>;
    /** Send a prompt to the Meta AI bot and resolve with the decrypted response. */
    aiPrompt(jid: string, prompt: string, options?: AIPromptOptions): Promise<unknown>;
    aiGroupCreate(subject: string, participants?: string[], options?: AIGroupCreateOptions): Promise<unknown>;
    aiGroupAddBot(jid: string, botUser?: string): Promise<unknown>;
    aiGroupLeave(id: string): Promise<unknown>;
    aiGroupParticipantsUpdate(jid: string, participants: string[], action: string): Promise<unknown>;
    aiGroupUpdateSubject(jid: string, subject: string): Promise<unknown>;
    aiGroupInviteCode(jid: string): Promise<unknown>;
    aiGroupRevokeInvite(jid: string): Promise<unknown>;
    aiGroupAcceptInvite(code: string): Promise<unknown>;
    aiGroupSettingUpdate(jid: string, setting: string): Promise<unknown>;
    aiGroupToggleEphemeral(jid: string, ephemeralExpiration: number): Promise<unknown>;

    // ---- Community / group extensions ----
    groupAcknowledge(jid: string): Promise<unknown>;
    groupGetLinkedParticipants(jid: string): Promise<Array<{ jid: string; phoneNumber?: string }>>;
    groupJoinLinked(parentJid: string, linkedGroupJid: string, type?: string): Promise<GroupJoinLinkedResult>;
    getGroupProfilePictures(jids: string[], type?: 'preview' | 'image'): Promise<GroupProfilePicture[]>;
    groupCreateSubGroupSuggestion(parentJid: string, suggestion: Array<Record<string, unknown>>): Promise<unknown>;
    groupSubGroupSuggestionsAction(parentJid: string, action: 'approve' | 'reject' | 'cancel', suggestions: Array<{ creator?: string; jid?: string }>): Promise<unknown>;

    // ---- Interop (Matrix bridge) ----
    initInterop(): Promise<unknown>;
    resetInteropSession(): Promise<unknown>;
    fetchIntegrators(): Promise<unknown>;
    acceptInteropTOS(): Promise<unknown>;
    optInIntegrators(): Promise<unknown>;
    optOutIntegrators(): Promise<unknown>;
    resolveInteropUser(jid: string): Promise<unknown>;
    resolveInteropUsers(jids: string[]): Promise<unknown>;
    getReachabilitySettings(): Promise<unknown>;
    setReachabilitySettings(settings: Record<string, unknown>): Promise<unknown>;
    blockInteropUser(jid: string): Promise<unknown>;
    unblockInteropUser(jid: string): Promise<unknown>;
    reportInteropSpam(jid: string): Promise<unknown>;
    trustInteropContact(jid: string): Promise<unknown>;
    createInteropGroup(subject: string, participants?: string[]): Promise<unknown>;
    leaveInteropGroup(jid: string): Promise<unknown>;
    addParticipantsToInteropGroup(jid: string, participants: string[]): Promise<unknown>;
    queryInteropGroupInfo(jid: string): Promise<unknown>;
    queryInteropPrivacySettings(): Promise<unknown>;
    updateInteropPrivacySetting(setting: string, value: string): Promise<unknown>;
    updateInteropPrivacySettingWithContactList(setting: string, value: string, contacts: string[]): Promise<unknown>;
    getInteropGroupAddPrivacy(): Promise<unknown>;

    // ---- Username / privacy / account layers ----
    checkUsername(username: string): Promise<unknown>;
    checkUsernameMulti(usernames: string[]): Promise<unknown>;
    setUsername(username: string, options?: Record<string, unknown>): Promise<unknown>;
    deleteUsername(): Promise<unknown>;
    getMyUsername(): Promise<unknown>;
    getUsernameRecommendations(): Promise<unknown>;
    setUsernamePin(pin: string): Promise<unknown>;
    findUserByUsername(username: string): Promise<unknown>;
    fetchContactUsernames(jids: string[]): Promise<unknown>;

    getPrivacySettings(): Promise<unknown>;
    setPrivacySetting(category: string, value: string): Promise<unknown>;
    updatePrivacyContactList(category: string, type: string, jids: string[]): Promise<unknown>;
    getPrivacyContactList(category: string): Promise<unknown>;
    updateTextStatus(status: string): Promise<unknown>;
    getTextStatusList(): Promise<unknown>;
    updateUserStatus(status: string): Promise<unknown>;
    fetchUserPictureInfo(jid: string): Promise<unknown>;
    setProfilePictureMex(jid: string, image: Buffer): Promise<unknown>;

    hasPassword(): Promise<unknown>;
    setPassword(password: string): Promise<unknown>;
    checkPassword(password: string): Promise<unknown>;
    deletePassword(): Promise<unknown>;
    passkeyExists(): Promise<unknown>;
    getRegistrationUpsells(): Promise<unknown>;
    contactsUpload(contacts: unknown[]): Promise<unknown>;
    submitAge(age: number): Promise<unknown>;

    managedAccountInitiateLinking(): Promise<unknown>;
    managedAccountValidateLinking(token: string): Promise<unknown>;
    managedAccountAcceptLinking(token: string): Promise<unknown>;
    managedAccountCompleteLinking(token: string): Promise<unknown>;
    managedAccountRevokeLinking(): Promise<unknown>;
    managedAccountSyncActivities(): Promise<unknown>;
    managedAccountUpdatePin(pin: string): Promise<unknown>;

    /** Send a status update to an explicit recipient list. */
    sendStatus(content: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
    /** Send a status update mentioning one or more recipients. */
    sendStatusMention(content: Record<string, unknown>, jids?: string[], options?: Record<string, unknown>): Promise<unknown>;
    /** Alias supporting multiple status recipients. */
    sendStatusMentions(content: Record<string, unknown>, jids?: string[], options?: Record<string, unknown>): Promise<unknown>;
    /** Send an experimental Gen4 / Meta-AI-style rich menu card. */
    richMenu(jid: string, content?: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
    /** Send a rich button-card grid. */
    sendRichButtonGrid(jid: string, grid: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
    /** Send a GenAI-style inline copy-to-clipboard rich response. */
    sendCopyButton(jid: string, content: { text: string; label?: string; alignment?: 'END' | 'START' | 'CENTER' }, options?: Record<string, unknown>): Promise<unknown>;
    /** Send a markdown-style interactive table with buttons. */
    sendInteractiveTable(jid: string, table: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
    /** Send a WhatsApp native flow button. */
    sendWhatsAppFlow(jid: string, flow: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;

    // ---- GraphQL layer ----
    setAccessToken(token: string): Promise<void>;
    setWamoAuth(token: string): Promise<void>;
    acquireAccessToken(): Promise<unknown>;
    executeWWWGraphQL(query: string, variables?: Record<string, unknown>): Promise<unknown>;
    executeFacebookGraphQL(query: string, variables?: Record<string, unknown>): Promise<unknown>;
    executeWamoGraphQL(query: string, variables?: Record<string, unknown>): Promise<unknown>;

    [key: string]: unknown;
}

export interface SocketConfig {
    [key: string]: unknown;
}

export interface CacheManagerStore {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown, ttl?: number): Promise<unknown>;
    delete(key: string): Promise<boolean>;
    keys(pattern?: string): Promise<string[]>;
    reset?(): Promise<void>;
}

/** Build a full auth-state (creds + keys) backed by a cache-manager store. */
export declare function makeCacheManagerAuthState(store: CacheManagerStore, sessionKey?: string): Promise<{
    state: unknown;
    saveCreds: () => Promise<void>;
}>;

/** Generate a self-contained local slot-machine HTML payload. */
export declare function generateSlotMachineHtml(options?: { title?: string; startingCredits?: number }): string;
export declare function buildImaginePrimitive(options?: { mediaType?: 'image' | 'video'; url?: string; thumbnail?: string; mimeType?: string; fileLength?: number; duration?: number; status?: string; estimatedMs?: number; imagineType?: string }): Record<string, unknown>;
export declare function parseNativeFlowResponse(message: unknown): Record<string, unknown> | null;
export declare function parseWhatsAppFlowResponse(message: unknown): Record<string, unknown> | null;
export declare function buildWhatsAppFlowButton(flow?: Record<string, unknown>): Record<string, unknown>;
export declare function makeWhatsAppFlowButton(flow?: Record<string, unknown>): { name: string; buttonParamsJson: string };
export declare function isViewOnceMessage(message: unknown): boolean;
export declare function extractViewOnceContent(message: unknown): Record<string, unknown> | null;
export declare function getViewOnceMediaType(message: unknown): string | null;
export declare function getViewOnceMediaContent(message: unknown): Record<string, unknown> | null;
export declare function parseViewOnceInfo(message: unknown): Record<string, unknown>;
export declare function shouldAutoDecryptViewOnce(message: unknown, config?: Record<string, unknown>): boolean;
export declare function shouldDeleteViewOnce(message: unknown, config?: Record<string, unknown>): boolean;
export declare function generateLinkPreviewHtml(url: string, options?: Record<string, unknown>): string;
export declare function generateWebsitePreviewHtml(url: string, options?: Record<string, unknown>): Promise<string>;
export declare function prepareRichTextMessage(options?: { text?: string }): Record<string, unknown>;
export declare function prepareRichImageMessage(options?: { url?: string; mimeType?: string }): Record<string, unknown>;
export declare function prepareRichLinkMessage(options?: { links?: Array<Record<string, unknown>>; text?: string }): Record<string, unknown>;
export declare function prepareRichGenerationMessage(content?: Record<string, unknown>): Record<string, unknown>;
export declare function prepareHtmlMessage(options?: { html?: string }): Record<string, unknown>;
export declare function prepareSlotMachineMessage(options?: { title?: string; startingCredits?: number }): Promise<Record<string, unknown>>;
export declare function prepareRichMenuMessage(content?: Record<string, unknown>, quoted?: unknown, options?: Record<string, unknown>): Record<string, unknown>;
export declare function downgradePremiumContent(content?: unknown): Record<string, unknown>;

/** Normalize an international phone number for an explicit status check. */
export declare function normalizeBanCheckNumber(value: string | { number: string }): string;

/** Perform an explicit, caller-configured WhatsApp registration-status check. */
export declare function checkStatusWA(number: string | { number: string }, options?: { endpoint?: string; fetch?: typeof fetch; headers?: Record<string, string>; signal?: AbortSignal; diagnostic?: boolean }): Promise<{ number: string; status: string; isBanned: boolean; isNeedOfficialWa: boolean; diagnostics?: { httpStatus: number; ok: boolean; bodyKeys: string[] } }>;

/** Wrap a socket with anti-ban protection (from the baileys-antiban bundle). */
export declare function wrapSocket(socket: WASocket, config?: unknown): WASocket;

declare function makeWASocket(config: SocketConfig): WASocket;
export { makeWASocket };
export default makeWASocket;
