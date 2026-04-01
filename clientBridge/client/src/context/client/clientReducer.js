const clientReducer = (state, action) => {
  switch (action.type) {
    // Set enriched client data
    case "ENRICH_CLIENT":
      return {
        ...state,
        enrichedClient: action.payload.enrichedClient,
        loading: false,
        error: null,
      };

    // Clear enrichment data
    case "CLEAR_ENRICHMENT":
      return {
        ...state,
        enrichedClient: null,
      };

    // Set loading state
    case "SET_LOADING":
      return {
        ...state,
        loading: action.payload,
      };

    // Set error state
    case "SET_ERROR":
      return {
        ...state,
        error: action.payload,
        loading: false,
      };

    // Clear error
    case "CLEAR_ERROR":
      return {
        ...state,
        error: null,
      };

    // Add a newly scheduled client to state
    case "ADD_SCHEDULED_CLIENT":
      return {
        ...state,
        newClient: action.payload.client,
        scheduledClients: [
          ...(state.scheduledClients || []),
          action.payload.client,
        ],
      };

    // Update an existing scheduled client
    case "UPDATE_SCHEDULED_CLIENT":
      const updatedClients = (state.scheduledClients || []).map((client) =>
        client._id === action.payload.client._id
          ? { ...client, ...action.payload.client }
          : client
      );

      return {
        ...state,
        scheduledClients: updatedClients,
      };

    // Remove a scheduled client by ID or case number
    case "DELETE_SCHEDULED_CLIENT":
      const { clientId, caseNumber, domain } = action.payload;

      return {
        ...state,
        scheduledClients: (state.scheduledClients || []).filter((client) => {
          // Remove by ID if provided
          if (clientId && client._id === clientId) {
            return false;
          }
          // Remove by case number and domain if provided
          if (caseNumber && client.caseNumber === caseNumber) {
            if (domain) {
              return !(client.domain === domain);
            }
            return false;
          }
          return true;
        }),
      };

    // Process client action (delay, etc.) - remove from current lists
    case "PROCESS_CLIENT_ACTION":
      const { client: processedClient, action: actionType } = action.payload;

      return {
        ...state,
        // Update enriched client if it matches
        enrichedClient:
          state.enrichedClient?.caseNumber === processedClient.caseNumber
            ? { ...state.enrichedClient, ...processedClient }
            : state.enrichedClient,
        // Clear any temporary state
        processingAction: null,
      };

    // Set processing action state
    case "SET_PROCESSING_ACTION":
      return {
        ...state,
        processingAction: action.payload,
      };

    // Refresh all client lists (called after actions)
    case "REFRESH_LISTS":
      return {
        ...state,
        // This is a signal to contexts to refresh their data
        lastRefresh: Date.now(),
      };

    default:
      return state;
  }
};

export default clientReducer;
