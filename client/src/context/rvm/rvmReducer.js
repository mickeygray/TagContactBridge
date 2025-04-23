const rvmReducer = (state, action) => {
  switch (action.type) {
    case "UPLOAD_TXTS":
      return { ...state, txtFiles: [...state.txtFiles, ...action.payload] };

    case "MOVE_TO_SCRAPING":
      return {
        ...state,
        txtFiles: state.txtFiles.filter(
          (file) => !action.payload.includes(file)
        ),
        scrapingQueue: [...state.scrapingQueue, ...action.payload],
      };

    case "EXTRACT_LEADS":
      return {
        ...state,
        scrapingQueue: [],
        extractedLeads: [...state.extractedLeads, ...action.payload],
      };

    case "SCRUB_LEADS":
      return { ...state, scrubbedLeads: action.payload };

    case "REMOVE_FILE":
      return {
        ...state,
        txtFiles: state.txtFiles.filter((_, index) => index !== action.payload),
      };

    default:
      return state;
  }
};

export default rvmReducer;
