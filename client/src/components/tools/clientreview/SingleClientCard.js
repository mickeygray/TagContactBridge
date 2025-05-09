// SingleClientCard.jsx
import React, { useState, useContext } from "react";
import ClientCrudCard from "./ClientCrudCard";
import ClientAnalysisCard from "./EnrichedClientCard";
import ClientContext from "../../../context/client/clientContext";

export default function SingleClientCard({ client, periodInfo }) {
  const { enrichClient, enrichedClient } = useContext(ClientContext);
  const [isEnriched, setIsEnriched] = useState(false);

  const handleAnalyze = async () => {
    enrichClient(client);
    setIsEnriched(true);
  };

  const handleBack = () => {
    setIsEnriched(false);
  };

  return (
    <div className="single-client-card">
      {isEnriched && enrichedClient ? (
        <ClientAnalysisCard client={enrichedClient} onHide={handleBack} />
      ) : (
        <ClientCrudCard
          client={client}
          onAnalyze={handleAnalyze}
          periodInfo={periodInfo}
        />
      )}
    </div>
  );
}
