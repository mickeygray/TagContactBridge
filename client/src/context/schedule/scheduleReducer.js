// client/src/context/ScheduleState/scheduleReducer.js
// ─────────────────────────────────────────────────────────────
// Repurposed for CallFire Auto-Dialer
// ─────────────────────────────────────────────────────────────

const scheduleReducer = (state, action) => {
  switch (action.type) {
    // ═══════════════════════════════════════════════════════════
    // DIALER STATE
    // ═══════════════════════════════════════════════════════════

    case "SET_DIALER_MODE":
      return {
        ...state,
        mode: action.payload, // "wynn" | "tag"
      };

    case "SET_LEADS":
      return {
        ...state,
        leads: action.payload.leads || [],
        leadsCount: action.payload.leads?.length || 0,
        loading: false,
      };

    case "START_DIALER":
      return {
        ...state,
        isRunning: true,
        isPaused: false,
        stats: {
          queued: action.payload.queued || 0,
          processed: 0,
          failed: action.payload.failed || 0,
          total: action.payload.total || 0,
        },
      };

    case "UPDATE_STATS":
      return {
        ...state,
        stats: {
          ...state.stats,
          ...action.payload,
        },
      };

    case "PAUSE_DIALER":
      return {
        ...state,
        isPaused: true,
      };

    case "RESUME_DIALER":
      return {
        ...state,
        isPaused: false,
      };

    case "STOP_DIALER":
      return {
        ...state,
        isRunning: false,
        isPaused: false,
      };

    case "RESET_DIALER":
      return {
        ...state,
        isRunning: false,
        isPaused: false,
        leads: [],
        leadsCount: 0,
        stats: {
          queued: 0,
          processed: 0,
          failed: 0,
          total: 0,
        },
      };

    // ═══════════════════════════════════════════════════════════
    // TAG FILTERS
    // ═══════════════════════════════════════════════════════════

    case "SET_TAG_FILTERS":
      return {
        ...state,
        tagFilters: {
          ...state.tagFilters,
          ...action.payload,
        },
      };

    // ═══════════════════════════════════════════════════════════
    // ACTIVITY LOG
    // ═══════════════════════════════════════════════════════════

    case "ADD_LOG":
      return {
        ...state,
        logs: [
          {
            timestamp: new Date().toLocaleTimeString(),
            message: action.payload.message,
            type: action.payload.type || "info",
          },
          ...state.logs.slice(0, 99), // Keep last 100 entries
        ],
      };

    case "CLEAR_LOGS":
      return {
        ...state,
        logs: [],
      };

    // ═══════════════════════════════════════════════════════════
    // LOADING & ERROR
    // ═══════════════════════════════════════════════════════════

    case "SET_LOADING":
      return {
        ...state,
        loading: true,
      };

    case "CLEAR_LOADING":
      return {
        ...state,
        loading: false,
      };

    case "SET_ERROR":
      return {
        ...state,
        error: action.payload,
        loading: false,
      };

    case "CLEAR_ERROR":
      return {
        ...state,
        error: null,
      };

    default:
      return state;
  }
};

export default scheduleReducer;
