const clientReducer = (state, action) => {
  switch (action.type) {
    // Set list of enriched clients
    case "ENRICH_CLIENT":
      return {
        ...state,
        enrichedClient: action.payload,
      };

    // Add a newly scheduled client to state
    case "ADD_SCHEDULED_CLIENT":
      return {
        ...state,
        scheduledClients: [...state.scheduledClients, action.payload],
      };

    // Update an existing scheduled client
    case "UPDATE_SCHEDULED_CLIENT":
      return {
        ...state,
        scheduledClients: state.scheduledClients.map((client) =>
          client._id === action.payload._id ? action.payload : client
        ),
      };

    // Remove a scheduled client by ID
    case "DELETE_SCHEDULED_CLIENT":
      return {
        ...state,
        scheduledClients: state.scheduledClients.filter(
          (client) => client._id !== action.payload
        ),
      };

    default:
      return state;
  }
};

export default clientReducer;
