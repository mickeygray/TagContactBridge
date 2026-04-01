// src/components/clientreview/ClientAnalysisList.jsx
import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import ClientAnalysisCard from "./ClientAnalysisCard";
import Pagination from "./Pagination";
import Tabs from "./Tabs";

const ITEMS_PER_PAGE = 9;

/**
 * @param {{ [tab: string]: any[] }} lists
 * @param {boolean} isDaily     if true, hide the tabs and always show `activeTab`
 * @param {string}  activeTab   which tab key to show when isDaily===true
 */
export default function ClientAnalysisList({
  title,
  lists,
  isDaily = false,
  activeTab = "review",
  CardComponent = ClientAnalysisCard, // 👈 fallback default
  cardProps = {}, // 👈 optional shared props
}) {
  const tabKeys = Object.keys(lists);
  const [view, setView] = useState(isDaily ? activeTab : tabKeys[0]);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (isDaily) {
      setView(activeTab);
      setPage(1);
    }
  }, [isDaily, activeTab]);

  const tabOptions = tabKeys.map((key) => ({
    key,
    label: key.charAt(0).toUpperCase() + key.slice(1),
  }));

  const source = lists[view] || [];
  const totalPages = Math.max(1, Math.ceil(source.length / ITEMS_PER_PAGE));
  const start = (page - 1) * ITEMS_PER_PAGE;
  const visible = source.slice(start, start + ITEMS_PER_PAGE);

  return (
    <div className="client-analysis-list">
      <h4 className="text-lg font-semibold mb-4">{title}</h4>

      {!isDaily && (
        <Tabs
          options={tabOptions}
          activeKey={view}
          onChange={(key) => {
            setView(key);
            setPage(1);
          }}
        />
      )}

      {visible.length === 0 ? (
        <p className="text-gray-600">No clients in this list.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-4">
            {visible.map((client, i) =>
              client ? (
                <CardComponent
                  key={client._id || client.caseNumber || i}
                  client={client}
                  {...cardProps}
                />
              ) : (
                <p key={i} className="text-red-500 text-sm">
                  ⚠️ Skipped invalid client at index {i}
                </p>
              )
            )}
          </div>

          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={(p) => setPage(p)}
          />
        </>
      )}
    </div>
  );
}

ClientAnalysisList.propTypes = {
  title: PropTypes.string.isRequired,
  lists: PropTypes.objectOf(PropTypes.array).isRequired,
  isDaily: PropTypes.bool,
  activeTab: PropTypes.string,
  CardComponent: PropTypes.elementType,
  cardProps: PropTypes.object,
};
