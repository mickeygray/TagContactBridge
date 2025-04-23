import React, { useState, useEffect } from "react";
import useCallRail from "../../hooks/useCallrail";
import CallCard from "./CallCard";

const CallFetcher = () => {
  const { calls, fetchCalls, error, trackingMap, fetchTrackingNumbers } =
    useCallRail();

  const [visibleCalls, setVisibleCalls] = useState([]);
  const [page, setPage] = useState(0);
  const itemsPerPage = 20;
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [searchPhone, setSearchPhone] = useState("");
  const [sortBy, setSortBy] = useState("duration");

  useEffect(() => {
    fetchTrackingNumbers();
  }, []);

  const sortCalls = (callsArray) => {
    return [...callsArray].sort((a, b) => {
      if (sortBy === "duration") return b.duration - a.duration;
      if (sortBy === "start_time")
        return new Date(b.start_time) - new Date(a.start_time);
      return 0;
    });
  };
  const handleNumberSearch = () => {
    if (!searchPhone) return;

    const normalizedSearch = normalizePhone(searchPhone);

    const filtered = calls.filter((call) =>
      normalizePhone(call.customer_phone_number).includes(normalizedSearch)
    );

    const sorted = sortCalls(filtered);
    setPage(0);
    setVisibleCalls(sorted.slice(0, itemsPerPage));
  };
  const updateVisible = (callsList, pageNum = 0) => {
    const sorted = sortCalls(callsList);
    const start = pageNum * itemsPerPage;
    const end = start + itemsPerPage;
    setVisibleCalls(sorted.slice(start, end));
  };

  const handleFetch = async (range = null, start = null, end = null) => {
    await fetchCalls({ range, startDate: start, endDate: end });
    setPage(0);
    updateVisible(calls);
  };

  const handleNext = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    updateVisible(calls, nextPage);
  };

  const handlePrev = () => {
    const prevPage = Math.max(page - 1, 0);
    setPage(prevPage);
    updateVisible(calls, prevPage);
  };

  const handleDelete = (id) => {
    const updated = visibleCalls.filter((call) => call.id !== id);
    setVisibleCalls(updated);
  };
  const normalizePhone = (num) => (num || "").replace(/\D/g, "");

  return (
    <div className="container">
      <h2 className="mb-1">📞 CallRail Call Fetcher</h2>
      <div className="btn-group mb-2">
        <button className="btn" onClick={() => handleFetch("today")}>
          Today
        </button>
        <button className="btn ml-1" onClick={() => handleFetch("yesterday")}>
          Yesterday
        </button>
        <button className="btn ml-1" onClick={() => setShowDatePicker(true)}>
          Custom Range
        </button>
        <select
          className="ml-2"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
        >
          <option value="duration">Sort by Duration</option>
          <option value="start_time">Sort by Start Time</option>
        </select>
        <input
          type="text"
          placeholder="Search by phone number"
          value={searchPhone}
          onChange={(e) => setSearchPhone(e.target.value)}
          className="input mb-2"
        />
        <button className="btn ml-1" onClick={handleNumberSearch}>
          Search
        </button>
      </div>

      {showDatePicker && (
        <div className="mb-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
          <button
            className="btn ml-1"
            onClick={() => {
              handleFetch(null, startDate, endDate);
              setShowDatePicker(false);
            }}
          >
            Go
          </button>
        </div>
      )}

      {error && <p className="text-red">Error: {error.message}</p>}

      <div className="call-list">
        {visibleCalls.map((call) => (
          <CallCard
            key={call.id}
            call={{
              ...call,
              lineName: trackingMap[normalizePhone(call.tracking_phone_number)],
            }}
            onDelete={handleDelete}
          />
        ))}
      </div>

      <div className="pagination mt-2">
        {page > 0 && (
          <button className="btn btn-outline" onClick={handlePrev}>
            ⬅️ Prev
          </button>
        )}
        {calls.length > (page + 1) * itemsPerPage && (
          <button className="btn btn-outline ml-1" onClick={handleNext}>
            Next ➡️
          </button>
        )}
      </div>
    </div>
  );
};

export default CallFetcher;
