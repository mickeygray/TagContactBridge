import React from "react";
import PropTypes from "prop-types";
import { useDailySchedule } from "../../../hooks/useDailySchedule";
import ClientAnalysisList from "../../common/ClientAnalysisList";
import DailyCreateClientAnalysisCard from "../cards/DailyCreateClientAnalysisCard";
import DailySalesClientAnalysisCard from "../cards/DailySalesClientAnalysisCard";
export default function DailyClientAnalysisList({ activeTab }) {
  const { emailQueue, textQueue, toReview } = useDailySchedule();

  // build your lists object and a title for the activeTab
  const lists = { email: emailQueue, text: textQueue, review: toReview };
  const titles = {
    email: `📨 Email Queue (${emailQueue.length})`,
    text: `📱 Text Queue (${textQueue.length})`,
    review: `🚨 Needs Review (${toReview.length})`,
  };
  const SmartDailyCard = (props) => {
    const { client } = props;

    const hasCreateDate = client.type === "createDate";

    const Card = hasCreateDate
      ? DailyCreateClientAnalysisCard
      : DailySalesClientAnalysisCard;

    return <Card {...props} />;
  };
  return (
    <ClientAnalysisList
      title={titles[activeTab]}
      lists={lists}
      CardComponent={SmartDailyCard}
      isDaily
      activeTab={activeTab}
    />
  );
}

DailyClientAnalysisList.propTypes = {
  /** Which queue to show: "email" | "text" | "review" */
  activeTab: PropTypes.oneOf(["email", "text", "review"]).isRequired,
};
