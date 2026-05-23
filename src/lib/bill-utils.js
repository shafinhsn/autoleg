// Bill number pattern: starts with A or S followed by digits
export const BILL_NUMBER_RE = /^[ASas]\d+/;

// Detect section headers from CSV rows
export function detectSectionTag(value) {
  const v = value.trim().toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (!v) return null;
  if (/\bTOP\s*5\b/.test(v) || /\bTOP\s*FIVE\b/.test(v)) return "TOP 5 PRIORITY";
  if (/\bTOP\s*10\b/.test(v) || /\bTOP\s*TEN\b/.test(v)) return "TOP 10 PRIORITY";
  if (/\bPOST\s*BUDGET\b/.test(v)) return "POST BUDGET";
  if (/\bBUDGET\b/.test(v)) return "BUDGET";
  if (/\bPASSED\b/.test(v)) return "PASSED";
  if (/\bACTIVE\b/.test(v)) return "ACTIVE";
  if (/\bMONITOR/.test(v)) return "MONITORING";
  if (/\bCAUCUS\b/.test(v)) return "CAUCUS BILLS";
  return null;
}

// CSV column auto-mapping
export const COLUMN_MAP = {
  "number": "bill_number",
  "bill number": "bill_number",
  "bill no": "bill_number",
  "bill no.": "bill_number",
  "bill": "bill_number",
  "bill #": "bill_number",
  "bill name": "title",
  "title": "title",
  "full title": "title",
  "short name": "short_name",
  "short": "short_name",
  "nickname": "short_name",
  "senate sponsor": "senate_sponsor",
  "senate companion sponsor": "senate_sponsor",
  "sponsor": "senate_sponsor",
  "senate sponsor/companion": "senate_sponsor",
  "assembly sponsor": "assembly_sponsor",
  "committee": "committee",
  "assembly committee": "committee",
  "latest status": "latest_status",
  "status": "latest_status",
  "bill status": "latest_status",
  "2026 status": "latest_status",
  "current status": "latest_status",
  "p&c contact": "pc_contact",
  "pc contact": "pc_contact",
  "contact": "pc_contact",
  "p&c": "pc_contact",
  "next steps": "next_steps",
  "action items": "next_steps",
  "2026 session comments": "session_comments",
  "session comments": "session_comments",
  "comments": "session_comments",
  "notes": "session_comments",
  "lobbyist / advocate": "lobbyist",
  "lobbyist/advocate": "lobbyist",
  "lobbyist": "lobbyist",
  "advocate": "lobbyist",
  "bill documents": "bill_documents",
  "documents": "bill_documents",
  "priority": "tags",
  "priority tag": "tags",
  "priority label": "tags",
  "priority rank": "priority_rank",
  "rank": "priority_rank",
  "staff assignees": "staff_assignees",
  "staff": "staff_assignees",
  "internal notes": "internal_notes",
  "linked senate bill": "linked_senate_bill",
  "senate bill": "linked_senate_bill",
  "companion bill": "linked_senate_bill",
  "google drive": "google_drive_url",
  "drive link": "google_drive_url",
  "drive folder": "google_drive_url",
  "caucus bill": "is_caucus_bill",
  "caucus": "is_caucus_bill",
};

export const SECTION_COLORS = {
  "TOP 5 PRIORITY": "#dc2626",
  "TOP 10 PRIORITY": "#2563eb",
  "ACTIVE": "#16a34a",
  "PASSED": "#7c3aed",
  "BUDGET": "#d97706",
  "POST BUDGET": "#ea580c",
  "MONITORING": "#6b7280",
  "CAUCUS BILLS": "#0891b2",
};

export function getSectionColor(name) {
  return SECTION_COLORS[name] || "#1e40af";
}