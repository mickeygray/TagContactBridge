import React from "react";
import PropTypes from "prop-types";
import ClientAnalysisList from "../../common/ClientAnalysisList";
import UnifiedCreateClientAnalysisCard from "../cards/UnifiedCreateClientAnalysisCard";
import UnifiedSaleClientAnalysisCard from "../cards/UnifiedSaleClientAnalysisCard";

export default function UnifiedClientAnalysisList({ clients }) {
  const lists = {
    review: clients,
  };

  const SmartUnifiedCard = ({ client }) => {
    const hasCreateDate = Boolean(client.createDate);

    if (hasCreateDate) {
      return <UnifiedCreateClientAnalysisCard client={client} />;
    } else return <UnifiedSaleClientAnalysisCard client={client} />;
  };

  return (
    <ClientAnalysisList
      title={"Client Search Results"}
      lists={lists}
      CardComponent={SmartUnifiedCard}
      isDaily={true}
      activeTab="review"
    />
  );
}

UnifiedClientAnalysisList.propTypes = {
  clients: PropTypes.array.isRequired,
  title: PropTypes.string,
};
