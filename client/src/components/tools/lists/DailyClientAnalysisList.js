import React, { useContext } from "react";
import PropTypes from "prop-types";
import ScheduleContext from "../../../context/schedule/scheduleContext";
import ClientAnalysisList from "../../common/ClientAnalysisList";

export default function DailyClientAnalysisList({ activeTab }) {
  const { emailQueue, textQueue, toReview } = useContext(ScheduleContext);

  // build your lists object and a title for the activeTab
  const lists = { email: emailQueue, text: textQueue, review: toReview };
  const titles = {
    email: `📨 Email Queue (${emailQueue.length})`,
    text: `📱 Text Queue (${textQueue.length})`,
    review: `🚨 Needs Review (${toReview.length})`,
  };

  return (
    <ClientAnalysisList
      title={titles[activeTab]}
      lists={lists}
      isDaily
      activeTab={activeTab}
    />
  );
}

DailyClientAnalysisList.propTypes = {
  /** Which queue to show: "email" | "text" | "review" */
  activeTab: PropTypes.oneOf(["email", "text", "review"]).isRequired,
};
