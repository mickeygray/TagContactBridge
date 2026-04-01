// client/src/components/tools/admin/ConsentVault.jsx
import React, { useState, useEffect } from "react";
import { useAdmin } from "../../../hooks/useAdmin";

const ConsentVault = () => {
  const {
    consentRecords,
    consentRecord,
    consentStats,
    loading,
    searchConsentRecords,
    getConsentRecord,
    getConsentStats,
    clearConsentRecord,
  } = useAdmin();

  const [filters, setFilters] = useState({
    email: "",
    phone: "",
    caseId: "",
    source: "",
    company: "",
    from: "",
    to: "",
  });

  const [searched, setSearched] = useState(false);

  useEffect(() => {
    getConsentStats();
    // eslint-disable-next-line
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    searchConsentRecords(filters);
    setSearched(true);
  };

  const handleReset = () => {
    setFilters({
      email: "",
      phone: "",
      caseId: "",
      source: "",
      company: "",
      from: "",
      to: "",
    });
    setSearched(false);
    clearConsentRecord();
  };

  const handleRowClick = (id) => {
    getConsentRecord(id);
  };

  const formatDate = (d) => {
    if (!d) return "—";
    return new Date(d).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const sourceLabel = (s) => {
    const map = {
      "ld-posting": "LD Posting",
      "lead-contact": "Lead Contact",
      facebook: "Facebook",
      tiktok: "TikTok",
      messenger: "Messenger",
      instagram: "Instagram",
      test: "Test",
    };
    return map[s] || s || "—";
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.vaultIcon}>🔐</div>
          <div>
            <h2 style={styles.title}>TCPA Consent Vault</h2>
            <p style={styles.subtitle}>
              Immutable consent records for compliance defense
            </p>
          </div>
        </div>
        {consentStats && (
          <div style={styles.statsRow}>
            <StatPill
              label="Total Records"
              value={consentStats.total?.toLocaleString()}
              color="#00ff88"
            />
            <StatPill
              label="TrustedForm"
              value={consentStats.withTrustedForm?.toLocaleString()}
              color="#00d4ff"
            />
            <StatPill
              label="Jornaya"
              value={consentStats.withJornaya?.toLocaleString()}
              color="#ff9500"
            />
          </div>
        )}
      </div>

      {/* Search Form */}
      <div style={styles.searchCard}>
        <form onSubmit={handleSearch}>
          <div style={styles.filterGrid}>
            <FilterInput
              label="Email"
              value={filters.email}
              onChange={(v) => setFilters({ ...filters, email: v })}
              placeholder="partial match ok"
            />
            <FilterInput
              label="Phone"
              value={filters.phone}
              onChange={(v) => setFilters({ ...filters, phone: v })}
              placeholder="digits only ok"
            />
            <FilterInput
              label="Case ID"
              value={filters.caseId}
              onChange={(v) => setFilters({ ...filters, caseId: v })}
              placeholder="Logics case ID"
            />
            <FilterSelect
              label="Source"
              value={filters.source}
              onChange={(v) => setFilters({ ...filters, source: v })}
              options={[
                { value: "", label: "All Sources" },
                { value: "ld-posting", label: "LD Posting" },
                { value: "lead-contact", label: "Lead Contact" },
                { value: "facebook", label: "Facebook" },
                { value: "tiktok", label: "TikTok" },
                { value: "messenger", label: "Messenger" },
                { value: "instagram", label: "Instagram" },
              ]}
            />
            <FilterSelect
              label="Company"
              value={filters.company}
              onChange={(v) => setFilters({ ...filters, company: v })}
              options={[
                { value: "", label: "Both Brands" },
                { value: "WYNN", label: "Wynn Tax Solutions" },
                { value: "TAG", label: "Tax Advocate Group" },
              ]}
            />
            <FilterInput
              label="From Date"
              value={filters.from}
              onChange={(v) => setFilters({ ...filters, from: v })}
              type="date"
            />
            <FilterInput
              label="To Date"
              value={filters.to}
              onChange={(v) => setFilters({ ...filters, to: v })}
              type="date"
            />
          </div>
          <div style={styles.searchActions}>
            <button type="submit" style={styles.searchBtn} disabled={loading}>
              {loading ? "Searching..." : "🔍 Search Records"}
            </button>
            {searched && (
              <button
                type="button"
                style={styles.resetBtn}
                onClick={handleReset}
              >
                ✕ Reset
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Detail Modal */}
      {consentRecord && (
        <div style={styles.modal} onClick={clearConsentRecord}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Consent Record Detail</h3>
              <button style={styles.closeBtn} onClick={clearConsentRecord}>
                ✕
              </button>
            </div>

            <div style={styles.modalGrid}>
              <DetailRow
                label="Received At"
                value={formatDate(consentRecord.receivedAt)}
              />
              <DetailRow label="Company" value={consentRecord.company || "—"} />
              <DetailRow
                label="Source"
                value={sourceLabel(consentRecord.source)}
              />
              <DetailRow label="Case ID" value={consentRecord.caseId || "—"} />
              <DetailRow label="Email" value={consentRecord.email || "—"} />
              <DetailRow label="Phone" value={consentRecord.phone || "—"} />
              <DetailRow label="IP Address" value={consentRecord.ip || "—"} />
              <DetailRow
                label="User Agent"
                value={consentRecord.userAgent || "—"}
                truncate
              />
              <DetailRow
                label="Jornaya LeadiD"
                value={consentRecord.jornayaLeadId || "—"}
                mono
              />
              <div style={styles.detailFull}>
                <span style={styles.detailLabel}>TrustedForm Certificate</span>
                {consentRecord.trustedFormCertUrl ? (
                  <a
                    href={consentRecord.trustedFormCertUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={styles.certLink}
                  >
                    View Certificate →
                  </a>
                ) : (
                  <span style={styles.detailValue}>—</span>
                )}
              </div>
            </div>

            <div style={styles.immutableBadge}>
              🔒 Immutable Record — Cannot be modified or deleted
            </div>
          </div>
        </div>
      )}

      {/* Results Table */}
      {searched && (
        <div style={styles.tableCard}>
          <div style={styles.tableHeader}>
            <span style={styles.tableTitle}>
              {loading
                ? "Loading..."
                : `${consentRecords.length} record${consentRecords.length !== 1 ? "s" : ""} found`}
            </span>
            {consentRecords.length > 0 && (
              <span style={styles.tableHint}>
                Click a row to view full details
              </span>
            )}
          </div>

          {!loading && consentRecords.length === 0 ? (
            <div style={styles.empty}>
              No records found matching your search.
            </div>
          ) : (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    {[
                      "Received",
                      "Company",
                      "Source",
                      "Email",
                      "Phone",
                      "Case ID",
                      "TrustedForm",
                      "Jornaya",
                    ].map((h) => (
                      <th key={h} style={styles.th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {consentRecords.map((r) => (
                    <tr
                      key={r._id}
                      style={styles.tr}
                      onClick={() => handleRowClick(r._id)}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = "#1a2a1a")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      <td style={styles.td}>{formatDate(r.receivedAt)}</td>
                      <td style={styles.td}>
                        <span
                          style={{
                            ...styles.badge,
                            background:
                              r.company === "TAG" ? "#1a3a2a" : "#1a2a3a",
                            color: r.company === "TAG" ? "#00ff88" : "#00d4ff",
                          }}
                        >
                          {r.company || "—"}
                        </span>
                      </td>
                      <td style={styles.td}>{sourceLabel(r.source)}</td>
                      <td style={styles.td}>{r.email || "—"}</td>
                      <td style={styles.td}>{r.phone || "—"}</td>
                      <td
                        style={{
                          ...styles.td,
                          fontFamily: "monospace",
                          fontSize: "11px",
                        }}
                      >
                        {r.caseId || "—"}
                      </td>
                      <td style={styles.td}>
                        {r.trustedFormCertUrl ? (
                          <span style={styles.tokenBadge}>✓ TF</span>
                        ) : (
                          <span style={styles.missingBadge}>—</span>
                        )}
                      </td>
                      <td style={styles.td}>
                        {r.jornayaLeadId ? (
                          <span
                            style={{
                              ...styles.tokenBadge,
                              background: "#2a1a00",
                              color: "#ff9500",
                            }}
                          >
                            ✓ JL
                          </span>
                        ) : (
                          <span style={styles.missingBadge}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Sub-components ────────────────────────────────────────────

const StatPill = ({ label, value, color }) => (
  <div style={{ ...styles.statPill, borderColor: color }}>
    <span style={{ ...styles.statValue, color }}>{value ?? "—"}</span>
    <span style={styles.statLabel}>{label}</span>
  </div>
);

const FilterInput = ({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}) => (
  <div style={styles.filterField}>
    <label style={styles.filterLabel}>{label}</label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder || ""}
      style={styles.filterInput}
    />
  </div>
);

const FilterSelect = ({ label, value, onChange, options }) => (
  <div style={styles.filterField}>
    <label style={styles.filterLabel}>{label}</label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={styles.filterInput}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  </div>
);

const DetailRow = ({ label, value, mono, truncate }) => (
  <div style={styles.detailRow}>
    <span style={styles.detailLabel}>{label}</span>
    <span
      style={{
        ...styles.detailValue,
        fontFamily: mono ? "monospace" : "inherit",
        fontSize: mono ? "12px" : "inherit",
        maxWidth: truncate ? "400px" : "none",
        overflow: truncate ? "hidden" : "visible",
        textOverflow: truncate ? "ellipsis" : "clip",
        whiteSpace: truncate ? "nowrap" : "normal",
      }}
    >
      {value}
    </span>
  </div>
);

// ── Styles ────────────────────────────────────────────────────

const styles = {
  container: {
    background: "#0a0f0a",
    minHeight: "100vh",
    padding: "24px",
    fontFamily: "'DM Mono', 'Courier New', monospace",
    color: "#c8d8c8",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: "24px",
    flexWrap: "wrap",
    gap: "16px",
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
  },
  vaultIcon: {
    fontSize: "36px",
    lineHeight: 1,
  },
  title: {
    margin: 0,
    fontSize: "22px",
    fontWeight: "700",
    color: "#00ff88",
    letterSpacing: "0.05em",
    textTransform: "uppercase",
  },
  subtitle: {
    margin: "4px 0 0",
    fontSize: "12px",
    color: "#4a6a4a",
    letterSpacing: "0.08em",
  },
  statsRow: {
    display: "flex",
    gap: "12px",
    flexWrap: "wrap",
  },
  statPill: {
    padding: "8px 14px",
    border: "1px solid",
    borderRadius: "4px",
    background: "#0f180f",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    minWidth: "90px",
  },
  statValue: {
    fontSize: "20px",
    fontWeight: "700",
    lineHeight: 1,
  },
  statLabel: {
    fontSize: "10px",
    color: "#4a6a4a",
    marginTop: "4px",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  searchCard: {
    background: "#0f180f",
    border: "1px solid #1a3a1a",
    borderRadius: "6px",
    padding: "20px",
    marginBottom: "20px",
  },
  filterGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: "12px",
    marginBottom: "16px",
  },
  filterField: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  filterLabel: {
    fontSize: "10px",
    color: "#4a6a4a",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
  },
  filterInput: {
    background: "#0a0f0a",
    border: "1px solid #1a3a1a",
    borderRadius: "4px",
    padding: "8px 10px",
    color: "#c8d8c8",
    fontSize: "13px",
    fontFamily: "inherit",
    outline: "none",
  },
  searchActions: {
    display: "flex",
    gap: "10px",
    alignItems: "center",
  },
  searchBtn: {
    background: "#003a1a",
    border: "1px solid #00ff88",
    borderRadius: "4px",
    color: "#00ff88",
    padding: "10px 20px",
    fontSize: "13px",
    fontFamily: "inherit",
    cursor: "pointer",
    letterSpacing: "0.05em",
  },
  resetBtn: {
    background: "transparent",
    border: "1px solid #2a3a2a",
    borderRadius: "4px",
    color: "#4a6a4a",
    padding: "10px 16px",
    fontSize: "13px",
    fontFamily: "inherit",
    cursor: "pointer",
  },
  tableCard: {
    background: "#0f180f",
    border: "1px solid #1a3a1a",
    borderRadius: "6px",
    overflow: "hidden",
  },
  tableHeader: {
    padding: "12px 16px",
    borderBottom: "1px solid #1a3a1a",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  tableTitle: {
    fontSize: "12px",
    color: "#00ff88",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
  },
  tableHint: {
    fontSize: "11px",
    color: "#2a4a2a",
  },
  tableWrap: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
  th: {
    padding: "10px 12px",
    fontSize: "10px",
    color: "#4a6a4a",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    textAlign: "left",
    borderBottom: "1px solid #1a3a1a",
    background: "#0a0f0a",
    whiteSpace: "nowrap",
  },
  tr: {
    borderBottom: "1px solid #0f180f",
    cursor: "pointer",
    transition: "background 0.1s",
  },
  td: {
    padding: "10px 12px",
    fontSize: "12px",
    color: "#9ab89a",
    whiteSpace: "nowrap",
  },
  badge: {
    padding: "2px 8px",
    borderRadius: "3px",
    fontSize: "11px",
    fontWeight: "600",
  },
  tokenBadge: {
    padding: "2px 8px",
    borderRadius: "3px",
    fontSize: "11px",
    fontWeight: "600",
    background: "#002a14",
    color: "#00ff88",
  },
  missingBadge: {
    color: "#2a4a2a",
    fontSize: "12px",
  },
  empty: {
    padding: "40px",
    textAlign: "center",
    color: "#2a4a2a",
    fontSize: "13px",
  },
  modal: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,0.8)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: "20px",
  },
  modalCard: {
    background: "#0f180f",
    border: "1px solid #00ff88",
    borderRadius: "8px",
    padding: "24px",
    width: "100%",
    maxWidth: "640px",
    maxHeight: "80vh",
    overflowY: "auto",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "20px",
    paddingBottom: "12px",
    borderBottom: "1px solid #1a3a1a",
  },
  modalTitle: {
    margin: 0,
    fontSize: "14px",
    color: "#00ff88",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
  },
  closeBtn: {
    background: "transparent",
    border: "none",
    color: "#4a6a4a",
    fontSize: "18px",
    cursor: "pointer",
    padding: "0 4px",
  },
  modalGrid: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  detailRow: {
    display: "grid",
    gridTemplateColumns: "160px 1fr",
    gap: "12px",
    alignItems: "start",
  },
  detailFull: {
    display: "grid",
    gridTemplateColumns: "160px 1fr",
    gap: "12px",
    alignItems: "center",
  },
  detailLabel: {
    fontSize: "10px",
    color: "#4a6a4a",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    paddingTop: "2px",
  },
  detailValue: {
    fontSize: "13px",
    color: "#c8d8c8",
    wordBreak: "break-all",
  },
  certLink: {
    color: "#00d4ff",
    fontSize: "13px",
    textDecoration: "none",
    borderBottom: "1px solid #00d4ff",
    paddingBottom: "1px",
  },
  immutableBadge: {
    marginTop: "20px",
    padding: "8px 12px",
    background: "#0a0f0a",
    border: "1px solid #1a3a1a",
    borderRadius: "4px",
    fontSize: "11px",
    color: "#2a4a2a",
    textAlign: "center",
    letterSpacing: "0.05em",
  },
};

export default ConsentVault;
