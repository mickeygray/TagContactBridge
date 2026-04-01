// src/components/clientreview/NewCreateClientAnalysisList.jsx
import React from "react";
import { useList } from "../../../hooks/useList";
import { toast } from "../../../utils/toast";
import ClientAnalysisList from "../../common/ClientAnalysisList";
import NewCreateClientAnalysisCard from "../cards/NewCreateClientAnalysisCard";

export default function NewCreateClientAnalysisList() {
  const { toReview, addCreateDateClients, skipClient } = useList();

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
        toast.success("Client", `Added ${client.caseNumber}`);
      } else {
        skipClient(client.caseNumber);
        toast.success("Client", `Removed ${client.caseNumber}`);
      }
    } catch (err) {
      toast.error(
        "Error",
        `Failed to ${action}: ${err.response?.data?.message || err.message}`
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
          toast.success("Client", `Removed ${client.caseNumber}`);
        },
      }}
    />
  );
}
