// From idle or a terminal status only start() moves on; `cancelled` is reachable when an action step cancels.
const FROM_REST = ['playing', 'waiting', 'completed', 'cancelled', 'failed'];
/** Every allowed status change. Anything else is a bug and throws `invalid-state`. */
export const TRANSITIONS = Object.freeze({
    idle: FROM_REST,
    playing: ['playing', 'waiting', 'paused', 'completed', 'cancelled', 'failed'],
    waiting: ['playing', 'waiting', 'paused', 'completed', 'cancelled', 'failed'],
    paused: ['playing', 'waiting', 'cancelled', 'failed'],
    completed: FROM_REST,
    cancelled: FROM_REST,
    failed: FROM_REST,
});
export function canTransition(from, to) {
    return TRANSITIONS[from].includes(to);
}
export function isTerminal(status) {
    return status === 'completed' || status === 'cancelled' || status === 'failed';
}
//# sourceMappingURL=state.js.map