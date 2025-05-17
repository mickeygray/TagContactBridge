import React, { useContext } from "react";
import ListContext from "../../../context/list/listContext";
import ClientAnalysisList from "../../common/ClientAnalysisList";
import PeriodClientAnalysisCard from "../cards/PeriodClientAnalysisCard";

export default function PeriodClientAnalysisList() {
  const { toReview, partial, verified, periodInfo } = useContext(ListContext);

  if (!periodInfo) return null;

  return (
    <ClientAnalysisList
      title={`📊 Period "${periodInfo.stage}" — ${periodInfo.periodSize} clients`}
      lists={{
        review: toReview,
        partial,
        verified,
      }}
      // no tabs for “period”; it’ll render review/partial/verified tabs automatically
      CardComponent={PeriodClientAnalysisCard}
    />
  );
}
