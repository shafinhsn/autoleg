import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { headers, sampleRows } = await req.json();
    
    if (!headers || !Array.isArray(headers) || headers.length === 0) {
      return Response.json({ error: 'No headers provided' }, { status: 400 });
    }

    const validFields = [
      'bill_number', 'title', 'short_name', 'senate_sponsor', 'assembly_sponsor',
      'committee', 'latest_status', 'section_header', 'tags', 'priority_rank',
      'pc_contact', 'next_steps', 'session_comments', 'lobbyist', 'bill_documents',
      'internal_notes', 'staff_assignees', 'linked_senate_bill', 'google_drive_url',
      'is_caucus_bill', 'hearing_date', 'hearing_time', 'hearing_location', 'section_85', 'skip'
    ];

    const prompt = `You are a CSV header mapping assistant for legislative bill tracking.

Analyze these CSV headers and map each one to the best matching target field, or "skip" if it doesn't match anything.

Available target fields:
- bill_number: Bill number like A1234 or S5678 (look for columns named NUMBER, BILL #, BILL NUMBER, etc.)
- title: Full bill title (BILL NAME, TITLE, etc.)
- short_name: Short name or nickname
- senate_sponsor: Senate sponsor name (SENATE SPONSOR, S SPONSOR)
- assembly_sponsor: Assembly sponsor name (ASSEMBLY SPONSOR, A SPONSOR)
- committee: Committee assignment
- latest_status: Current status (LATEST STATUS, STATUS)
- section_header: Section/category like TOP 5 PRIORITY
- tags: Priority tags
- priority_rank: Priority ranking (often a column like "85" or a number)
- section_85: Section 85 comments (column literally named "85" or "SECTION 85")
- pc_contact: P&C Contact
- next_steps: Next steps
- session_comments: Session comments (2026 SESSION COMMENTS, COMMENTS)
- lobbyist: Lobbyist/advocate (LOBBYIST / ADVOCATE)
- bill_documents: Bill documents link (BILL DOCUMENTS, BILL PUSH ACTIONS)
- internal_notes: Internal notes (COMMENTS, NOTES, INTERNAL NOTES)
- staff_assignees: Staff assigned
- linked_senate_bill: Companion senate bill
- google_drive_url: Google Drive link
- is_caucus_bill: Caucus bill yes/no (CAUCUS BILL)
- hearing_date: Hearing date
- hearing_time: Hearing time
- hearing_location: Hearing location
- skip: ignore this column

CSV Headers to map: ${JSON.stringify(headers)}
Sample row: ${JSON.stringify(sampleRows?.[0] || {})}

Respond with ONLY a raw JSON object (no markdown, no explanation) mapping each header string to a field name.
Example: {"NUMBER": "bill_number", "BILL NAME": "title", "CAUCUS BILL": "is_caucus_bill", "XYZ": "skip"}`;

    // Use plain string response to avoid JSON schema issues, then parse manually
    const raw = await base44.integrations.Core.InvokeLLM({ prompt });

    let mapping = {};
    try {
      // Strip markdown code fences if present
      const cleaned = String(raw).replace(/```json|```/g, '').trim();
      mapping = JSON.parse(cleaned);
    } catch (e) {
      console.error('Failed to parse LLM response:', raw);
      // Fall through with empty mapping — frontend will use fallback
    }

    return Response.json({ mapping });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});