// utils/singleClientInteractions.js
const {
  fetchActivities,
  fetchInvoices,
  fetchPayments,
  createZeroInvoice,
  uploadCaseDocument,
  createTask,
  createActivity,
  fetchBillingSummary,
  fetchTasks,
} = require("../services/logicsService");

module.exports = {
  /**
   * Pull in all Logics data for a single client.
   * Returns an object: { activities, invoices, payments }
   */
  async enrichClient(domain, caseID) {
    const [activities, invoices, payments, billingSummary, tasks] =
      await Promise.all([
        fetchActivities(domain, caseID),
        fetchInvoices(domain, caseID),
        fetchPayments(domain, caseID),
        fetchBillingSummary(domain, caseID),
        fetchTasks(domain, caseID),
      ]);

    const filteredActivities = activities.filter((a) => {
      const subject = a.Subject?.toLowerCase() || "";
      const comment = a.Comment?.toLowerCase() || "";

      const keywords = [
        "swc",
        "note",
        "invoice",
        "message",
        "cci",
        "a/s",
        "adserv",
        "additional",
        "fed",
        "complain",
      ];

      const lastNames = [
        "anderson",
        "cazares",
        "wallace",
        "wells",
        "haro",
        "hayes",
        "pearson",
        "burton",
        "pineda",
        "collins",
      ];

      const subjectMatch = keywords.some((kw) => subject.includes(kw));
      const commentMatch = lastNames.some((name) => comment.includes(name));

      return subjectMatch || commentMatch;
    });
    return { filteredActivities, invoices, payments, billingSummary, tasks };
  },

  /**
   * Create a zero-dollar invoice via Logics.
   */
  async zeroInvoice(domain, caseID) {
    return createZeroInvoice(domain, caseID);
  },

  /**
   * Upload a document into Logics.
   */
  async uploadDocument({
    caseID,
    comment,
    fileCategoryID,
    fileBuffer,
    filename,
    contentType,
  }) {
    return uploadCaseDocument({
      caseID,
      comment,
      fileCategoryID,
      fileBuffer,
      filename,
      contentType,
    });
  },

  /**
   * Create a follow-up task in Logics.
   */
  async createTaskForClient({ domain, caseID, subject, comments, dueDate }) {
    return createTask(domain, caseID, subject, comments, dueDate);
  },

  /**
   * Create an activity/note in Logics.
   */
  async createActivityForClient({ domain, caseID, subject, comment }) {
    return createActivity(domain, caseID, subject, comment);
  },
};
