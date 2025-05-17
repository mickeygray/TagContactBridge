// src/components/clientreview/NewCreateClientAnalysisList.jsx
import React, { useContext } from "react";
import ListContext from "../../../context/list/listContext";
import MessageContext from "../../../context/message/messageContext";
import ClientAnalysisList from "../../common/ClientAnalysisList";
import NewCreateClientAnalysisCard from "../cards/NewCreateClientAnalysisCard";

export default function NewCreateClientAnalysisList() {
  const { toReview, addCreateDateClients, skipClient } =
    useContext(ListContext);
  const { showMessage, showError } = useContext(MessageContext);

  // define the two buttons on each card
  const actions = [
    { key: "add", label: "Save Client", variant: "primary" },
    { key: "remove", label: "Remove", variant: "outline" },
  ];

  // called when a user clicks one of those buttons
  const handleReview = async (client, action) => {
    try {
      if (action === "add") {
        // wrap in array because the bulk API expects an array
        await addCreateDateClients([client]);
        showMessage("Client", `Added ${client.caseNumber}`, 200);
      } else {
        skipClient(client.caseNumber);
        showMessage("Client", `Removed ${client.caseNumber}`, 200);
      }
    } catch (err) {
      showError(
        "Client",
        `Failed to ${action}: ${err.response?.data?.message || err.message}`,
        err.response?.status
      );
    }
  };

  return (
    <ClientAnalysisList
      title="🆕 New Create-Date Clients"
      lists={{ review: toReview }}
      CardComponent={NewCreateClientAnalysisCard}
      cardProps={{
        actions,
        onReview: handleReview,
        onSkip: (client) => {
          skipClient(client.caseNumber);
          showMessage("Client", `Removed ${client.caseNumber}`, 200);
        },
      }}
    />
  );
}
