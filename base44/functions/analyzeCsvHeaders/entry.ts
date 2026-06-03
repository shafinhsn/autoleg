import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Mirror of the frontend COLUMN_MAP — keep in sync with lib/bill-utils.js
const COLUMN_MAP = {
  "85": "section_85",
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
  " comments": "session_comments",
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
  "bill push actions": "skip",
  "bill push actions ": "skip",
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { headers } = await req.json();

    if (!headers || !Array.isArray(headers) || headers.length === 0) {
      return Response.json({ error: 'No headers provided' }, { status: 400 });
    }

    const mapping = {};
    for (const h of headers) {
      mapping[h] = COLUMN_MAP[h.toLowerCase().trim()] || 'skip';
    }

    return Response.json({ mapping });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});